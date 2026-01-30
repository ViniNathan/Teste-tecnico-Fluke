import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from 'express';
import { pool } from '../../db/client';
import {
	eventCreateSchema,
	eventFiltersSchema,
	requeueStuckSchema,
} from '../../domain/validators';
import type { ListResponse } from '../../types/api';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const router = Router();
const eventsLogger = createLogger({ module: 'events' });

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const normalizeDateParam = (
	value?: string,
	endOfDay = false,
): Date | undefined => {
	if (!value) {
		return undefined;
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw new ValidationError('Invalid date format');
	}

	const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
	if (isDateOnly && endOfDay) {
		return new Date(parsed.getTime() + ONE_DAY_MS - 1);
	}

	return parsed;
};

const buildEventWhereClause = (filters: {
	state?: string;
	type?: string;
	start_date?: string;
	end_date?: string;
}) => {
	const params: (string | number | Date)[] = [];
	const clauses: string[] = [];

	const startDate = normalizeDateParam(filters.start_date);
	const endDate = normalizeDateParam(filters.end_date, true);

	if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
		throw new ValidationError(
			'end_date must be greater than or equal to start_date',
		);
	}

	if (filters.state) {
		clauses.push(`state = $${params.length + 1}`);
		params.push(filters.state);
	}

	if (filters.type) {
		clauses.push(`type = $${params.length + 1}`);
		params.push(filters.type);
	}

	if (startDate) {
		clauses.push(`created_at >= $${params.length + 1}`);
		params.push(startDate);
	}

	if (endDate) {
		clauses.push(`created_at <= $${params.length + 1}`);
		params.push(endDate);
	}

	const whereClause =
		clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

	return { whereClause, params };
};

// POST /events - ingere evento. Duplicatas (mesmo external_id) apenas incrementam
// received_count; evento NÃO é reprocessado. Ver README "Comportamento com Duplicatas".
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const payload = eventCreateSchema.parse(req.body);

		eventsLogger.debug({ payload }, 'Creating event');

		const client = await pool.connect();
		try {
			await client.query('BEGIN');

			// ON CONFLICT: só incrementa received_count; não altera state nem payload.
			// Duplicatas não são reprocessadas (evita reexecução de ações externas).
			const result = await client.query(
				`
        INSERT INTO events (external_id, type, payload, state)
        VALUES ($1, $2, $3, 'pending')
        ON CONFLICT (external_id)
        DO UPDATE SET received_count = events.received_count + 1
        RETURNING id, external_id, state, created_at, received_count
        `,
				[payload.id, payload.type, payload.data],
			);

			await client.query('COMMIT');

			const event = result.rows[0];
			const isDuplicate = event.received_count > 1;

			eventsLogger.info(
				{
					eventId: event.id,
					externalId: event.external_id,
					receivedCount: event.received_count,
					isDuplicate,
				},
				isDuplicate
					? 'Event ingested (duplicate, not reprocessed)'
					: 'Event ingested',
			);

			res.status(201).json(event);
		} catch (dbErr) {
			await client.query('ROLLBACK');
			throw dbErr;
		} finally {
			client.release();
		}
	} catch (err) {
		next(err);
	}
});

// GET /events/stats - aggregated counters
router.get(
	'/stats',
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const filters = eventFiltersSchema.parse(req.query);
			const { whereClause, params } = buildEventWhereClause(filters);

			const result = await pool.query(
				`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE state = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE state = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE state = 'processed')::int AS processed,
        COUNT(*) FILTER (WHERE state = 'failed')::int AS failed,
        COUNT(*) FILTER (
          WHERE state = 'failed'
            AND COALESCE(processed_at, created_at) >= NOW() - INTERVAL '24 hours'
        )::int AS failed_last_24h
      FROM events
      ${whereClause}
      `,
				params,
			);

			res.json(result.rows[0]);
		} catch (err) {
			next(err);
		}
	},
);

// GET /events/:id - detalhes do evento
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const eventId = parseInt(req.params.id as string, 10);

		if (Number.isNaN(eventId)) {
			throw new ValidationError('Invalid event ID');
		}

		const result = await pool.query('SELECT * FROM events WHERE id = $1', [
			eventId,
		]);

		if (result.rows.length === 0) {
			throw new NotFoundError(`Event with ID ${eventId} not found`);
		}

		res.json(result.rows[0]);
	} catch (err) {
		next(err);
	}
});

// GET /events - lista eventos
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const {
			state,
			type,
			start_date,
			end_date,
			limit: limitParam = '50',
			offset: offsetParam = '0',
		} = eventFiltersSchema.parse(req.query);

		const limit = parseInt(limitParam, 10);
		const offset = parseInt(offsetParam, 10);

		const { whereClause, params } = buildEventWhereClause({
			state,
			type,
			start_date,
			end_date,
		});

		const queryParams = [...params, limit, offset];

		const result = await pool.query(
			`
      SELECT *
      FROM events
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${queryParams.length - 1}
      OFFSET $${queryParams.length}
      `,
			queryParams,
		);

		const response: ListResponse<Record<string, unknown>> = {
			data: result.rows,
			count: result.rows.length,
			limit,
			offset,
		};

		res.json(response);
	} catch (err) {
		next(err);
	}
});

// GET /events/:id/attempts - histórico de tentativas para um evento
router.get(
	'/:id/attempts',
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const eventId = parseInt(req.params.id as string, 10);

			if (Number.isNaN(eventId)) {
				throw new ValidationError('Invalid event ID');
			}

			// Buscar todas as tentativas com rule executions
			const result = await pool.query(
				`
      SELECT 
        ea.id,
        ea.event_id,
        ea.status,
        ea.error,
        ea.started_at,
        ea.finished_at,
        ea.duration_ms::integer as duration_ms,
      COALESCE(
        json_agg(
          json_build_object(
            'id', re.id,
            'rule_id', re.rule_id,
              'rule_name', r.name,
              'rule_version_id', re.rule_version_id,
              'rule_version', rv.version,
              'result', re.result,
              'error', re.error,
              'executed_at', re.executed_at
            )
          ) FILTER (WHERE re.id IS NOT NULL), '[]'
        ) as rule_executions
      FROM event_attempts ea
      LEFT JOIN rule_executions re ON re.attempt_id = ea.id
      LEFT JOIN rules r ON r.id = re.rule_id
      LEFT JOIN rule_versions rv ON rv.id = re.rule_version_id
      WHERE ea.event_id = $1
      GROUP BY ea.id
      ORDER BY ea.started_at DESC
      `,
				[eventId],
			);

			const response: ListResponse<Record<string, unknown>> = {
				data: result.rows,
				count: result.rows.length,
				limit: result.rows.length,
				offset: 0,
			};

			res.json(response);
		} catch (err) {
			next(err);
		}
	},
);

// POST /events/requeue-stuck - requeue eventos presos em processing
router.post(
	'/requeue-stuck',
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = requeueStuckSchema.parse(req.body ?? {});
			const timeoutSeconds = payload.older_than_seconds
				? payload.older_than_seconds
				: Number(process.env.PROCESSING_TIMEOUT_SECONDS ?? '300');

			if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
				throw new ValidationError('Invalid processing timeout');
			}

			const result = await pool.query(
				`
        UPDATE events
        SET state = 'pending',
            processing_started_at = NULL
        WHERE state = 'processing'
          AND processing_started_at IS NOT NULL
          AND processing_started_at < NOW() - ($1 || ' seconds')::interval
        RETURNING id, external_id, type, state, processing_started_at
        `,
				[timeoutSeconds],
			);

			eventsLogger.warn(
				{
					requeued: result.rows.length,
					timeoutSeconds,
				},
				'Requeued stuck events',
			);

			res.json({
				message: 'Stuck events requeued',
				timeout_seconds: timeoutSeconds,
				requeued: result.rows.length,
				events: result.rows,
			});
		} catch (err) {
			next(err);
		}
	},
);

export { router as eventsRouter };
