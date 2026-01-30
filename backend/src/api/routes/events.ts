import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from 'express';
import { pool } from '../../db/client';
import { eventCreateSchema, requeueStuckSchema } from '../../domain/validators';
import type { ListResponse } from '../../types/api';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const router = Router();
const eventsLogger = createLogger({ module: 'events' });

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
		const { state, type, limit = '50', offset = '0' } = req.query;

		let query = 'SELECT * FROM events WHERE 1=1';
		const params: (string | number | boolean)[] = [];
		let paramIndex = 1;

		if (state) {
			query += ` AND state = $${paramIndex++}`;
			params.push(state);
		}

		if (type) {
			query += ` AND type = $${paramIndex++}`;
			params.push(type);
		}

		query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
		params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

		const result = await pool.query(query, params);

		const response: ListResponse<Record<string, unknown>> = {
			data: result.rows,
			count: result.rows.length,
			limit: parseInt(limit as string, 10),
			offset: parseInt(offset as string, 10),
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
        ea.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', re.id,
              'rule_id', re.rule_id,
              'rule_name', r.name,
              'rule_version_id', re.rule_version_id,
              'result', re.result,
              'error', re.error,
              'executed_at', re.executed_at
            )
          ) FILTER (WHERE re.id IS NOT NULL), '[]'
        ) as rule_executions
      FROM event_attempts ea
      LEFT JOIN rule_executions re ON re.attempt_id = ea.id
      LEFT JOIN rules r ON r.id = re.rule_id
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
