import type { NextFunction, Request, Response } from 'express';
import {
	eventCreateSchema,
	eventFiltersSchema,
	requeueStuckSchema,
} from '../../domain/validators';
import { eventService } from '../../services/event.service';

/**
 * @swagger
 * tags:
 *   name: Events
 *   description: Gerenciamento de eventos
 */
export class EventController {
	/**
	 * @swagger
	 * /events:
	 *   post:
	 *     summary: Ingere um novo evento
	 *     tags: [Events]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - id
	 *               - type
	 *               - data
	 *             properties:
	 *               id:
	 *                 type: string
	 *                 description: ID externo do evento
	 *               type:
	 *                 type: string
	 *                 description: Tipo do evento (ex. order.created)
	 *               data:
	 *                 type: object
	 *                 description: Payload JSON do evento
	 *     responses:
	 *       201:
	 *         description: Evento criado com sucesso
	 *       400:
	 *         description: Dados inválidos
	 */
	async create(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const payload = eventCreateSchema.parse(req.body);
			const event = await eventService.create(payload);
			res.status(201).json(event);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /events:
	 *   get:
	 *     summary: Lista eventos com filtros
	 *     tags: [Events]
	 *     parameters:
	 *       - in: query
	 *         name: state
	 *         schema:
	 *           type: string
	 *           enum: [pending, processing, processed, failed]
	 *         description: Filtrar por estado
	 *       - in: query
	 *         name: type
	 *         schema:
	 *           type: string
	 *         description: Filtrar por tipo de evento
	 *       - in: query
	 *         name: start_date
	 *         schema:
	 *           type: string
	 *           format: date
	 *         description: Data inicial (YYYY-MM-DD)
	 *       - in: query
	 *         name: end_date
	 *         schema:
	 *           type: string
	 *           format: date
	 *         description: Data final (YYYY-MM-DD)
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 50
	 *         description: Limite de resultados
	 *       - in: query
	 *         name: offset
	 *         schema:
	 *           type: integer
	 *           default: 0
	 *         description: Offset para paginação
	 *     responses:
	 *       200:
	 *         description: Lista de eventos
	 */
	async list(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const filters = eventFiltersSchema.parse(req.query);
			const result = await eventService.list({
				...filters,
				limit: filters.limit ? parseInt(filters.limit, 10) : undefined,
				offset: filters.offset ? parseInt(filters.offset, 10) : undefined,
			});
			res.json(result);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /events/stats:
	 *   get:
	 *     summary: Retorna estatísticas agregadas de eventos
	 *     tags: [Events]
	 *     parameters:
	 *       - in: query
	 *         name: state
	 *         schema:
	 *           type: string
	 *           enum: [pending, processing, processed, failed]
	 *       - in: query
	 *         name: type
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: start_date
	 *         schema:
	 *           type: string
	 *           format: date
	 *       - in: query
	 *         name: end_date
	 *         schema:
	 *           type: string
	 *           format: date
	 *     responses:
	 *       200:
	 *         description: Estatísticas de eventos
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 total:
	 *                   type: integer
	 *                 pending:
	 *                   type: integer
	 *                 processing:
	 *                   type: integer
	 *                 processed:
	 *                   type: integer
	 *                 failed:
	 *                   type: integer
	 *                 failed_last_24h:
	 *                   type: integer
	 */
	async getStats(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const filters = eventFiltersSchema.parse(req.query);
			const stats = await eventService.getStats(filters);
			res.json(stats);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /events/{id}:
	 *   get:
	 *     summary: Busca um evento por ID
	 *     tags: [Events]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *         description: ID do evento
	 *     responses:
	 *       200:
	 *         description: Detalhes do evento
	 *       404:
	 *         description: Evento não encontrado
	 */
	async getById(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const eventId = parseInt(req.params.id as string, 10);
			const event = await eventService.getById(eventId);
			res.json(event);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /events/{id}/attempts:
	 *   get:
	 *     summary: Busca histórico de tentativas de um evento
	 *     tags: [Events]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *         description: ID do evento
	 *     responses:
	 *       200:
	 *         description: Lista de tentativas
	 *       404:
	 *         description: Evento não encontrado
	 */
	async getAttempts(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const eventId = parseInt(req.params.id as string, 10);
			const attempts = await eventService.getAttempts(eventId);
			res.json(attempts);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /events/requeue-stuck:
	 *   post:
	 *     summary: Requeue eventos travados em processing
	 *     tags: [Events]
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               older_than_seconds:
	 *                 type: integer
	 *                 description: Requeue eventos mais antigos que N segundos
	 *     responses:
	 *       200:
	 *         description: Eventos requeued
	 */
	async requeueStuck(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const payload = requeueStuckSchema.parse(req.body ?? {});
			const result = await eventService.requeueStuck(
				payload.older_than_seconds,
			);
			res.json(result);
		} catch (err) {
			next(err);
		}
	}
}

export const eventController = new EventController();
