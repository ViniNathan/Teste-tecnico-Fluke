import { pool } from '../../src/db/client';

export const resetDatabase = async () => {
	await pool.query(
		`
      TRUNCATE TABLE
        rule_executions,
        event_attempts,
        rule_versions,
        rules,
        events
      RESTART IDENTITY CASCADE;
    `,
	);
};

export const getEventById = async (id: number) => {
	const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
	return result.rows[0] ?? null;
};

export const getAttemptsByEventId = async (eventId: number) => {
	const result = await pool.query(
		'SELECT * FROM event_attempts WHERE event_id = $1 ORDER BY started_at ASC',
		[eventId],
	);
	return result.rows;
};

export const getRuleExecutionsByAttemptId = async (attemptId: number) => {
	const result = await pool.query(
		'SELECT * FROM rule_executions WHERE attempt_id = $1 ORDER BY id ASC',
		[attemptId],
	);
	return result.rows;
};

export const insertEvent = async (fields: {
	external_id: string;
	type: string;
	payload?: Record<string, unknown>;
	state?: string;
	processing_started_at?: string | Date | null;
}): Promise<number> => {
	const result = await pool.query(
		`
      INSERT INTO events (external_id, type, payload, state, processing_started_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
		[
			fields.external_id,
			fields.type,
			fields.payload ?? {},
			fields.state ?? 'pending',
			fields.processing_started_at ?? null,
		],
	);
	return result.rows[0].id as number;
};
