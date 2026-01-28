import { pool } from '../db/client';
import type { Event } from '../domain/types';
import type { ClaimedEvent } from '../types/worker';
import { createLogger } from '../utils/logger';
import { processClaimedEvent } from './processor';

const workerLogger = createLogger({ module: 'worker' });

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? '1000');

const claimNextEvent = async (): Promise<ClaimedEvent | null> => {
	const client = await pool.connect();

	try {
		await client.query('BEGIN');

		const candidate = await client.query<{ id: number }>(
			`
      SELECT id
      FROM events
      WHERE state = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
      `,
		);

		if (candidate.rows.length === 0) {
			await client.query('COMMIT');
			return null;
		}

		const eventId = candidate.rows[0].id;

		const updated = await client.query<Event>(
			`
      UPDATE events
      SET state = 'processing'
      WHERE id = $1
      RETURNING *
      `,
			[eventId],
		);

		const event = updated.rows[0];

		const attempt = await client.query<{ id: number }>(
			`
      INSERT INTO event_attempts (event_id, status, error, started_at)
      VALUES ($1, NULL, NULL, NOW())
      RETURNING id
      `,
			[eventId],
		);

		const attemptId = attempt.rows[0].id;

		await client.query('COMMIT');

		return {
			event,
			attemptId,
		};
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	} finally {
		client.release();
	}
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startWorker = async () => {
	workerLogger.info({ pollIntervalMs: POLL_INTERVAL_MS }, 'Worker started');

	let running = true;

	const shutdown = (signal: string) => {
		workerLogger.info({ signal }, 'Worker shutdown requested');
		running = false;
	};

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));

	while (running) {
		let claim: ClaimedEvent | null = null;

		try {
			claim = await claimNextEvent();
		} catch (err) {
			workerLogger.error({ error: err }, 'Failed to claim event');
			await sleep(POLL_INTERVAL_MS);
			continue;
		}

		if (!claim) {
			await sleep(POLL_INTERVAL_MS);
			continue;
		}

		try {
			await processClaimedEvent(claim);
		} catch (err) {
			workerLogger.error(
				{ eventId: claim.event.id, error: err },
				'Unhandled worker error',
			);
		}
	}

	workerLogger.info('Worker stopped');
};
