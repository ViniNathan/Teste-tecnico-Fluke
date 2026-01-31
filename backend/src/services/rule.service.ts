import { pool } from '../db/client';
import type { ListResponse } from '../types/api';
import { NotFoundError, ValidationError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger({ module: 'rule-service' });

export interface RuleCreatePayload {
	name: string;
	event_type: string;
	condition: unknown;
	action: unknown;
	active?: boolean;
}

export interface RuleUpdatePayload {
	name?: string;
	event_type?: string;
	condition?: unknown;
	action?: unknown;
	active?: boolean;
}

export interface RuleFilters {
	active?: boolean;
	event_type?: string;
	limit?: number;
	offset?: number;
}

const parseJsonField = (value: unknown) => {
	if (typeof value !== 'string') {
		return value;
	}
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
};

const toJsonParam = (value: unknown) =>
	typeof value === 'string' ? value : JSON.stringify(value);

export class RuleService {
	/**
	 * Cria uma nova regra com a primeira versão
	 */
	async create(payload: RuleCreatePayload) {
		logger.debug({ payload }, 'Creating rule');

		const client = await pool.connect();
		try {
			await client.query('BEGIN');

			// 1. Cria a regra
			const ruleResult = await client.query(
				`
				INSERT INTO rules (name, event_type, active)
				VALUES ($1, $2, $3)
				RETURNING id, name, event_type, active, created_at, updated_at
				`,
				[payload.name, payload.event_type, payload.active ?? true],
			);

			const rule = ruleResult.rows[0];

			// 2. Cria a primeira versão
			const versionResult = await client.query(
				`
				INSERT INTO rule_versions (rule_id, condition, action, version)
				VALUES ($1, $2, $3, 1)
				RETURNING id, rule_id, condition, action, version, created_at
				`,
				[rule.id, toJsonParam(payload.condition), toJsonParam(payload.action)],
			);

			const version = versionResult.rows[0];

			// 3. Linka a versão atual à regra
			await client.query(
				`
				UPDATE rules 
				SET current_version_id = $1, updated_at = NOW()
				WHERE id = $2
				`,
				[version.id, rule.id],
			);

			await client.query('COMMIT');

			logger.info({ ruleId: rule.id, versionId: version.id }, 'Rule created');

			return {
				...rule,
				current_version: {
					...version,
					condition: parseJsonField(version.condition),
					action: parseJsonField(version.action),
				},
			};
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
		}
	}

	/**
	 * Busca uma regra por ID
	 */
	async getById(ruleId: number) {
		if (Number.isNaN(ruleId)) {
			throw new ValidationError('Invalid rule ID');
		}

		const result = await pool.query(
			`
			SELECT 
				r.*,
				rv.id as version_id,
				rv.condition,
				rv.action,
				rv.version,
				rv.created_at as version_created_at
			FROM rules r
			LEFT JOIN rule_versions rv ON r.current_version_id = rv.id
			WHERE r.id = $1
			`,
			[ruleId],
		);

		if (result.rows.length === 0) {
			throw new NotFoundError(`Rule with ID ${ruleId} not found`);
		}

		const row = result.rows[0];

		return {
			id: row.id,
			name: row.name,
			event_type: row.event_type,
			active: row.active,
			created_at: row.created_at,
			updated_at: row.updated_at,
			current_version: row.version_id
				? {
						id: row.version_id,
						condition: parseJsonField(row.condition),
						action: parseJsonField(row.action),
						version: row.version,
						created_at: row.version_created_at,
					}
				: null,
		};
	}

	/**
	 * Lista regras com filtros e paginação
	 */
	async list(
		filters: RuleFilters,
	): Promise<ListResponse<Record<string, unknown>>> {
		const limit = filters.limit ?? 50;
		const offset = filters.offset ?? 0;

		let query = `
			SELECT 
				r.*,
				rv.id as version_id,
				rv.condition,
				rv.action,
				rv.version,
				rv.created_at as version_created_at
			FROM rules r
			LEFT JOIN rule_versions rv ON r.current_version_id = rv.id
			WHERE 1=1
		`;

		const params: (string | number | boolean)[] = [];
		let paramIndex = 1;

		if (filters.active !== undefined) {
			query += ` AND r.active = $${paramIndex++}`;
			params.push(filters.active);
		}

		if (filters.event_type) {
			query += ` AND r.event_type = $${paramIndex++}`;
			params.push(filters.event_type);
		}

		query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
		params.push(limit, offset);

		const result = await pool.query(query, params);

		const rules = result.rows.map((row) => ({
			id: row.id,
			name: row.name,
			event_type: row.event_type,
			active: row.active,
			created_at: row.created_at,
			updated_at: row.updated_at,
			current_version: row.version_id
				? {
						id: row.version_id,
						condition: parseJsonField(row.condition),
						action: parseJsonField(row.action),
						version: row.version,
						created_at: row.version_created_at,
					}
				: null,
		}));

		return {
			data: rules,
			count: rules.length,
			limit,
			offset,
		};
	}

	/**
	 * Atualiza uma regra. Cria nova versão se condition/action mudar.
	 */
	async update(ruleId: number, payload: RuleUpdatePayload) {
		if (Number.isNaN(ruleId)) {
			throw new ValidationError('Invalid rule ID');
		}

		logger.debug({ ruleId, payload }, 'Updating rule');

		const client = await pool.connect();
		try {
			await client.query('BEGIN');

			// 1. Verifica se a regra existe
			const existingRule = await client.query(
				'SELECT * FROM rules WHERE id = $1',
				[ruleId],
			);

			if (existingRule.rows.length === 0) {
				throw new NotFoundError(`Rule with ID ${ruleId} not found`);
			}

			const rule = existingRule.rows[0];

			// 2. Atualiza os metadados (name, event_type, active)
			const updates: string[] = [];
			const params: (string | number | boolean)[] = [];
			let paramIndex = 1;

			if (payload.name !== undefined) {
				updates.push(`name = $${paramIndex++}`);
				params.push(payload.name);
			}

			if (payload.event_type !== undefined) {
				updates.push(`event_type = $${paramIndex++}`);
				params.push(payload.event_type);
			}

			if (payload.active !== undefined) {
				updates.push(`active = $${paramIndex++}`);
				params.push(payload.active);
			}

			if (updates.length > 0) {
				updates.push(`updated_at = NOW()`);
				params.push(ruleId);

				await client.query(
					`UPDATE rules SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
					params,
				);
			}

			// 3. Cria uma nova versão se a condição ou a ação mudaram
			let newVersionId = rule.current_version_id;

			if (payload.condition !== undefined || payload.action !== undefined) {
				// Obtém a versão atual
				const currentVersion = await client.query(
					'SELECT * FROM rule_versions WHERE id = $1',
					[rule.current_version_id],
				);

				const current = currentVersion.rows[0];

				// Cria uma nova versão
				const versionResult = await client.query(
					`
					INSERT INTO rule_versions (rule_id, condition, action, version)
					VALUES ($1, $2, $3, $4)
					RETURNING id, rule_id, condition, action, version, created_at
					`,
					[
						ruleId,
						toJsonParam(payload.condition ?? current.condition),
						toJsonParam(payload.action ?? current.action),
						current.version + 1,
					],
				);

				newVersionId = versionResult.rows[0].id;

				// Atualiza o current_version_id
				await client.query(
					`UPDATE rules SET current_version_id = $1, updated_at = NOW() WHERE id = $2`,
					[newVersionId, ruleId],
				);

				logger.info(
					{
						ruleId,
						oldVersion: current.version,
						newVersion: current.version + 1,
					},
					'Rule version created',
				);
			}

			await client.query('COMMIT');

			// 4. Obtém a regra atualizada
			const updatedRule = await client.query(
				`
				SELECT 
					r.*,
					rv.id as version_id,
					rv.condition,
					rv.action,
					rv.version,
					rv.created_at as version_created_at
				FROM rules r
				LEFT JOIN rule_versions rv ON r.current_version_id = rv.id
				WHERE r.id = $1
				`,
				[ruleId],
			);

			const row = updatedRule.rows[0];

			return {
				id: row.id,
				name: row.name,
				event_type: row.event_type,
				active: row.active,
				created_at: row.created_at,
				updated_at: row.updated_at,
				current_version: {
					id: row.version_id,
					condition: parseJsonField(row.condition),
					action: parseJsonField(row.action),
					version: row.version,
					created_at: row.version_created_at,
				},
			};
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
		}
	}

	/**
	 * Desativa uma regra
	 */
	async deactivate(ruleId: number) {
		if (Number.isNaN(ruleId)) {
			throw new ValidationError('Invalid rule ID');
		}

		const result = await pool.query(
			`
			UPDATE rules 
			SET active = false, updated_at = NOW()
			WHERE id = $1
			RETURNING id, name, active
			`,
			[ruleId],
		);

		if (result.rows.length === 0) {
			throw new NotFoundError(`Rule with ID ${ruleId} not found`);
		}

		logger.info({ ruleId }, 'Rule deactivated');

		return {
			message: 'Rule deactivated',
			rule: result.rows[0],
		};
	}

	/**
	 * Busca histórico de versões de uma regra
	 */
	async getVersions(ruleId: number) {
		if (Number.isNaN(ruleId)) {
			throw new ValidationError('Invalid rule ID');
		}

		const result = await pool.query(
			`
			SELECT * FROM rule_versions
			WHERE rule_id = $1
			ORDER BY version DESC
			`,
			[ruleId],
		);

		const versions = result.rows.map((row) => ({
			...row,
			condition: parseJsonField(row.condition),
			action: parseJsonField(row.action),
		}));

		return {
			rule_id: ruleId,
			versions,
			count: versions.length,
		};
	}
}

export const ruleService = new RuleService();
