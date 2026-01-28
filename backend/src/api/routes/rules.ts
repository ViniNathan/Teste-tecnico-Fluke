// backend/src/api/routes/rules.ts
import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from 'express';
import { pool } from '../../db/client';
import { ruleCreateSchema, ruleUpdateSchema } from '../../domain/validators';
import type { ListResponse } from '../../types/api';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const router = Router();
const rulesLogger = createLogger({ module: 'rules' });

// POST /rules - cria uma nova regra
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const payload = ruleCreateSchema.parse(req.body);

		rulesLogger.debug({ payload }, 'Creating rule');

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
				[payload.name, payload.event_type, payload.active],
			);

			const rule = ruleResult.rows[0];

			// 2. Cria a primeira versão
			const versionResult = await client.query(
				`
        INSERT INTO rule_versions (rule_id, condition, action, version)
        VALUES ($1, $2, $3, 1)
        RETURNING id, rule_id, condition, action, version, created_at
        `,
				[rule.id, payload.condition, JSON.stringify(payload.action)],
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

			rulesLogger.info(
				{ ruleId: rule.id, versionId: version.id },
				'Rule created',
			);

			res.status(201).json({
				...rule,
				current_version: {
					...version,
					action: (() => {
						try {
							return typeof version.action === 'string'
								? JSON.parse(version.action)
								: version.action;
						} catch (e) {
							return version.action;
						}
					})(),
				},
			});
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

// GET /rules - lista todas as regras
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { active, event_type, limit = '50', offset = '0' } = req.query;

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

		const params: any[] = [];
		let paramIndex = 1;

		if (active !== undefined) {
			query += ` AND r.active = $${paramIndex++}`;
			params.push(active === 'true');
		}

		if (event_type) {
			query += ` AND r.event_type = $${paramIndex++}`;
			params.push(event_type);
		}

		query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
		params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

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
						condition: row.condition,
						action: (() => {
							try {
								return typeof row.action === 'string'
									? JSON.parse(row.action)
									: row.action;
							} catch (e) {
								return row.action;
							}
						})(),
						version: row.version,
						created_at: row.version_created_at,
					}
				: null,
		}));

		const response: ListResponse<any> = {
			data: rules,
			count: rules.length,
			limit: parseInt(limit as string, 10),
			offset: parseInt(offset as string, 10),
		};

		res.json(response);
	} catch (err) {
		next(err);
	}
});

// GET /rules/:id - detalhes da regra
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const ruleId = parseInt(req.params.id as string, 10);

		if (isNaN(ruleId)) {
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

		const rule = {
			id: row.id,
			name: row.name,
			event_type: row.event_type,
			active: row.active,
			created_at: row.created_at,
			updated_at: row.updated_at,
			current_version: row.version_id
				? {
						id: row.version_id,
						condition: row.condition,
						action: (() => {
							try {
								return typeof row.action === 'string'
									? JSON.parse(row.action)
									: row.action;
							} catch (e) {
								return row.action;
							}
						})(),
						version: row.version,
						created_at: row.version_created_at,
					}
				: null,
		};

		res.json(rule);
	} catch (err) {
		next(err);
	}
});

// PUT /rules/:id - atualiza uma regra
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const ruleId = parseInt(req.params.id as string, 10);

		if (isNaN(ruleId)) {
			throw new ValidationError('Invalid rule ID');
		}

		const payload = ruleUpdateSchema.parse(req.body);

		rulesLogger.debug({ ruleId, payload }, 'Updating rule');

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
			const params: any[] = [];
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
						payload.condition ?? current.condition,
						JSON.stringify(payload.action ?? current.action),
						current.version + 1,
					],
				);

				newVersionId = versionResult.rows[0].id;

				// Atualiza o current_version_id
				await client.query(
					`UPDATE rules SET current_version_id = $1, updated_at = NOW() WHERE id = $2`,
					[newVersionId, ruleId],
				);

				rulesLogger.info(
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

			res.json({
				id: row.id,
				name: row.name,
				event_type: row.event_type,
				active: row.active,
				created_at: row.created_at,
				updated_at: row.updated_at,
				current_version: {
					id: row.version_id,
					condition: row.condition,
					action:
						typeof row.action === 'string'
							? JSON.parse(row.action)
							: row.action,
					version: row.version,
					created_at: row.version_created_at,
				},
			});
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

// DELETE /rules/:id - desativa uma regra
router.delete(
	'/:id',
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const ruleId = parseInt(req.params.id as string, 10);

			if (isNaN(ruleId)) {
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

			rulesLogger.info({ ruleId }, 'Rule deactivated');

			res.json({
				message: 'Rule deactivated',
				rule: result.rows[0],
			});
		} catch (err) {
			next(err);
		}
	},
);

// GET /rules/:id/versions - histórico de versões
router.get(
	'/:id/versions',
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const ruleId = parseInt(req.params.id as string, 10);

			if (isNaN(ruleId)) {
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
				action: row.action,
			}));

			res.json({
				rule_id: ruleId,
				versions,
				count: versions.length,
			});
		} catch (err) {
			next(err);
		}
	},
);

export { router as rulesRouter };
