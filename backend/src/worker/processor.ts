import type { PoolClient } from 'pg';
import { pool } from '../db/client';
import type { Action, RuleExecutionResult } from '../domain/types';
import type { ClaimedEvent, RuleRow } from '../types/worker';
import { createLogger } from '../utils/logger';
import { executeAction } from './actions';
import { evaluateJsonLogic, parseJsonValue } from './ruleEngine';

const processorLogger = createLogger({ module: 'processor' });

const toErrorString = (error: unknown) => {
	if (error instanceof Error) {
		return [error.name, error.message, error.stack].filter(Boolean).join('\n');
	}
	return String(error);
};

const recordRuleExecution = async (
	client: PoolClient,
	attemptId: number,
	rule: RuleRow,
	result: RuleExecutionResult,
	error: string | null,
) => {
	await client.query(
		`
      INSERT INTO rule_executions (attempt_id, rule_id, rule_version_id, result, error)
      VALUES ($1, $2, $3, $4, $5)
      `,
		[attemptId, rule.rule_id, rule.rule_version_id, result, error],
	);
};

const loadRulesForEvent = async (
	client: PoolClient,
	eventType: string,
): Promise<RuleRow[]> => {
	const result = await client.query<RuleRow>(
		`
      SELECT 
        r.id as rule_id,
        r.name as rule_name,
        rv.id as rule_version_id,
        rv.version as rule_version,
        rv.condition,
        rv.action
      FROM rules r
      JOIN rule_versions rv ON rv.id = r.current_version_id
      WHERE r.active = true AND r.event_type = $1
      ORDER BY r.id ASC
      `,
		[eventType],
	);

	return result.rows;
};

const finalizeAttemptAndEvent = async (
	client: PoolClient,
	attemptId: number,
	eventId: number,
	status: 'success' | 'failed',
	state: 'processed' | 'failed',
	error: string | null,
) => {
	await client.query('BEGIN');
	try {
		await client.query(
			`
      UPDATE event_attempts
      SET status = $1,
          error = $2,
          finished_at = NOW(),
          duration_ms = FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)
      WHERE id = $3
      `,
			[status, error, attemptId],
		);

		await client.query(
			`
      UPDATE events
      SET state = $1, processed_at = NOW(), processing_started_at = NULL
      WHERE id = $2
      `,
			[state, eventId],
		);

		await client.query('COMMIT');
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	}
};

const normalizeAction = (action: unknown): Action => {
	const parsed = parseJsonValue(action);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Invalid action format');
	}
	return parsed as Action;
};

export const processClaimedEvent = async (claim: ClaimedEvent) => {
	const client = await pool.connect();
	const errors: string[] = [];
	const attemptLogger = processorLogger.child({
		eventId: claim.event.id,
		attemptId: claim.attemptId,
	});
	const startedAt = Date.now();

	try {
		const rules = await loadRulesForEvent(client, claim.event.type);

		for (const rule of rules) {
			let result: RuleExecutionResult = 'skipped';
			let error: string | null = null;

			try {
				const conditionMatched = evaluateJsonLogic(
					rule.condition,
					claim.event.payload,
				);

				if (!conditionMatched) {
					result = 'skipped';
					await recordRuleExecution(
						client,
						claim.attemptId,
						rule,
						result,
						null,
					);
					continue;
				}

				const action = normalizeAction(rule.action);
				await executeAction(action, claim.event, {
					eventId: claim.event.id,
					attemptId: claim.attemptId,
				});
				result = 'applied';
			} catch (err) {
				error = toErrorString(err);
				result = 'failed';
				errors.push(error);
			}

			await recordRuleExecution(client, claim.attemptId, rule, result, error);
		}

		const attemptStatus = errors.length > 0 ? 'failed' : 'success';
		const eventState = errors.length > 0 ? 'failed' : 'processed';
		const attemptError = errors.length > 0 ? errors.join('\n') : null;

		await finalizeAttemptAndEvent(
			client,
			claim.attemptId,
			claim.event.id,
			attemptStatus,
			eventState,
			attemptError,
		);

		const durationMs = Date.now() - startedAt;
		attemptLogger.info(
			{
				eventId: claim.event.id,
				attemptId: claim.attemptId,
				status: attemptStatus,
				errors: errors.length,
				duration_ms: durationMs,
			},
			'Event processed',
		);
	} catch (err) {
		const errorMessage = toErrorString(err);
		const durationMs = Date.now() - startedAt;

		attemptLogger.error(
			{
				eventId: claim.event.id,
				attemptId: claim.attemptId,
				error: errorMessage,
				duration_ms: durationMs,
			},
			'Processing failed',
		);

		try {
			await finalizeAttemptAndEvent(
				client,
				claim.attemptId,
				claim.event.id,
				'failed',
				'failed',
				errorMessage,
			);
		} catch (updateErr) {
			attemptLogger.error(
				{ error: toErrorString(updateErr) },
				'Failed to persist processing error',
			);
		}
	} finally {
		client.release();
	}
};
