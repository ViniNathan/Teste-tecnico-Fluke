import type { NextFunction, Request, Response } from 'express';
import { ruleCreateSchema, ruleUpdateSchema } from '../../domain/validators';
import { ruleService } from '../../services/rule.service';

/**
 * @swagger
 * tags:
 *   name: Rules
 *   description: Gerenciamento de regras de processamento
 */
export class RuleController {
	/**
	 * @swagger
	 * /rules:
	 *   post:
	 *     summary: Cria uma nova regra
	 *     tags: [Rules]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *               - event_type
	 *               - condition
	 *               - action
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 description: Nome da regra
	 *               event_type:
	 *                 type: string
	 *                 description: Tipo de evento alvo
	 *               condition:
	 *                 type: object
	 *                 description: Expressão JSONLogic
	 *               action:
	 *                 type: object
	 *                 description: Ação a ser executada
	 *               active:
	 *                 type: boolean
	 *                 default: true
	 *     responses:
	 *       201:
	 *         description: Regra criada com sucesso
	 *       400:
	 *         description: Dados inválidos
	 */
	async create(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const payload = ruleCreateSchema.parse(req.body);
			const rule = await ruleService.create(payload);
			res.status(201).json(rule);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /rules:
	 *   get:
	 *     summary: Lista regras com filtros
	 *     tags: [Rules]
	 *     parameters:
	 *       - in: query
	 *         name: active
	 *         schema:
	 *           type: string
	 *           enum: ['true', 'false']
	 *         description: Filtrar por status ativo
	 *       - in: query
	 *         name: event_type
	 *         schema:
	 *           type: string
	 *         description: Filtrar por tipo de evento
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 50
	 *       - in: query
	 *         name: offset
	 *         schema:
	 *           type: integer
	 *           default: 0
	 *     responses:
	 *       200:
	 *         description: Lista de regras
	 */
	async list(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const { active, event_type, limit = '50', offset = '0' } = req.query;
			const result = await ruleService.list({
				active: active !== undefined ? active === 'true' : undefined,
				event_type: event_type as string | undefined,
				limit: parseInt(limit as string, 10),
				offset: parseInt(offset as string, 10),
			});
			res.json(result);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /rules/{id}:
	 *   get:
	 *     summary: Busca uma regra por ID
	 *     tags: [Rules]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *         description: ID da regra
	 *     responses:
	 *       200:
	 *         description: Detalhes da regra
	 *       404:
	 *         description: Regra não encontrada
	 */
	async getById(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const ruleId = parseInt(req.params.id as string, 10);
			const rule = await ruleService.getById(ruleId);
			res.json(rule);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /rules/{id}:
	 *   put:
	 *     summary: Atualiza uma regra
	 *     tags: [Rules]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               name:
	 *                 type: string
	 *               event_type:
	 *                 type: string
	 *               condition:
	 *                 type: object
	 *               action:
	 *                 type: object
	 *               active:
	 *                 type: boolean
	 *     responses:
	 *       200:
	 *         description: Regra atualizada
	 *       404:
	 *         description: Regra não encontrada
	 */
	async update(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const ruleId = parseInt(req.params.id as string, 10);
			const payload = ruleUpdateSchema.parse(req.body);
			const rule = await ruleService.update(ruleId, payload);
			res.json(rule);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /rules/{id}:
	 *   delete:
	 *     summary: Desativa uma regra
	 *     tags: [Rules]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: Regra desativada
	 *       404:
	 *         description: Regra não encontrada
	 */
	async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const ruleId = parseInt(req.params.id as string, 10);
			const result = await ruleService.deactivate(ruleId);
			res.json(result);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /rules/{id}/versions:
	 *   get:
	 *     summary: Busca histórico de versões de uma regra
	 *     tags: [Rules]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: Lista de versões
	 */
	async getVersions(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const ruleId = parseInt(req.params.id as string, 10);
			const versions = await ruleService.getVersions(ruleId);
			res.json(versions);
		} catch (err) {
			next(err);
		}
	}
}

export const ruleController = new RuleController();
