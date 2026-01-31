import { pool } from '../db/client';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger({ module: 'replay-service' });

export class ReplayService {
	/**
	 * Reprocessa um evento individual.
	 * Apenas eventos em estado 'processed' ou 'failed' podem ser reprocessados.
	 */
	async replayEvent(eventId: number) {
		if (Number.isNaN(eventId)) {
			throw new ValidationError('Invalid event ID');
		}

		logger.info({ eventId }, 'Replay requested');

		const client = await pool.connect();
		try {
			await client.query('BEGIN');

			// 1. Obtém o evento
			const eventResult = await client.query(
				'SELECT * FROM events WHERE id = $1',
				[eventId],
			);

			if (eventResult.rows.length === 0) {
				throw new NotFoundError(`Event with ID ${eventId} not found`);
			}

			const event = eventResult.rows[0];

			// 2. Valida o estado (apenas eventos em estado 'processed' ou 'failed' podem ser reprocessados)
			if (!['processed', 'failed'].includes(event.state)) {
				throw new ConflictError(
					`Cannot replay event in state '${event.state}'. Only 'processed' or 'failed' events can be replayed.`,
				);
			}

			// 3. Atualiza o estado para 'pending' e define o timestamp replayed_at
			const updateResult = await client.query(
				`
				UPDATE events 
				SET state = 'pending', replayed_at = NOW(), processing_started_at = NULL
				WHERE id = $1
				RETURNING id, external_id, type, state, replayed_at
				`,
				[eventId],
			);

			await client.query('COMMIT');

			const updatedEvent = updateResult.rows[0];

			logger.info(
				{ eventId, previousState: event.state },
				'Event queued for replay',
			);

			return {
				message: 'Event queued for replay',
				event: updatedEvent,
				warning:
					'Replay uses current rules. Non-idempotent actions are deduplicated (at-most-once) but may be skipped if previously applied.',
			};
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
		}
	}

	/**
	 * Reprocessa múltiplos eventos em batch.
	 */
	async replayBatch(eventIds: number[]) {
		logger.info({ count: eventIds.length }, 'Batch replay requested');

		const client = await pool.connect();
		try {
			await client.query('BEGIN');

			// Atualiza todos os eventos para 'pending'
			const result = await client.query(
				`
				UPDATE events 
				SET state = 'pending', replayed_at = NOW(), processing_started_at = NULL
				WHERE id = ANY($1::int[])
					AND state IN ('processed', 'failed')
				RETURNING id, external_id, state
				`,
				[eventIds],
			);

			await client.query('COMMIT');

			logger.info(
				{ requested: eventIds.length, replayed: result.rows.length },
				'Batch replay completed',
			);

			return {
				message: 'Events queued for replay',
				requested: eventIds.length,
				replayed: result.rows.length,
				events: result.rows,
				warning:
					'Replay uses current rules. Non-idempotent actions are deduplicated (at-most-once).',
			};
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
		}
	}
}

export const replayService = new ReplayService();
