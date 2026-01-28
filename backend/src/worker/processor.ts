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

const finishAttempt = async (
	client: PoolClient,
	attemptId: number,
	status: 'success' | 'failed',
	error: string | null,
) => {
	await client.query(
		`
      UPDATE event_attempts
      SET status = $1, error = $2, finished_at = NOW()
      WHERE id = $3
      `,
		[status, error, attemptId],
	);
};

const updateEventState = async (
	client: PoolClient,
	eventId: number,
	state: 'processed' | 'failed',
) => {
	await client.query(
		`
      UPDATE events
      SET state = $1, processed_at = NOW()
      WHERE id = $2
      `,
		[state, eventId],
	);
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
				await executeAction(action, claim.event);
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

		await finishAttempt(client, claim.attemptId, attemptStatus, attemptError);
		await updateEventState(client, claim.event.id, eventState);

		processorLogger.info(
			{
				eventId: claim.event.id,
				attemptId: claim.attemptId,
				status: attemptStatus,
				errors: errors.length,
			},
			'Event processed',
		);
	} catch (err) {
		const errorMessage = toErrorString(err);

		processorLogger.error(
			{
				eventId: claim.event.id,
				attemptId: claim.attemptId,
				error: errorMessage,
			},
			'Processing failed',
		);

		try {
			await finishAttempt(client, claim.attemptId, 'failed', errorMessage);
			await updateEventState(client, claim.event.id, 'failed');
		} catch (updateErr) {
			processorLogger.error(
				{ error: toErrorString(updateErr) },
				'Failed to persist processing error',
			);
		}
	} finally {
		client.release();
	}
};
