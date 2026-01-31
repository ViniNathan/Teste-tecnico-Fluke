import type { NextFunction, Request, Response } from 'express';
import { replayBatchSchema } from '../../domain/validators';
import { replayService } from '../../services/replay.service';

/**
 * @swagger
 * tags:
 *   name: Replay
 *   description: Reprocessamento de eventos
 */
export class ReplayController {
	/**
	 * @swagger
	 * /events/{id}/replay:
	 *   post:
	 *     summary: Reprocessa um evento
	 *     tags: [Replay]
	 *     description: |
	 *       Apenas eventos em estado 'processed' ou 'failed' podem ser reprocessados.
	 *       A reprocessação usa as versões atuais das regras (podem diferir das originais).
	 *       Ações não idempotentes são deduplicadas (at-most-once).
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *         description: ID do evento
	 *     responses:
	 *       200:
	 *         description: Evento agendado para reprocessamento
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 message:
	 *                   type: string
	 *                 event:
	 *                   type: object
	 *                 warning:
	 *                   type: string
	 *       404:
	 *         description: Evento não encontrado
	 *       409:
	 *         description: Evento em estado inválido para replay
	 */
	async replayEvent(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const eventId = parseInt(req.params.id as string, 10);
			const result = await replayService.replayEvent(eventId);
			res.json(result);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * @swagger
	 * /events/replay-batch:
	 *   post:
	 *     summary: Reprocessa múltiplos eventos em batch
	 *     tags: [Replay]
	 *     description: |
	 *       Apenas eventos em estado 'processed' ou 'failed' serão reprocessados.
	 *       Eventos em outros estados são ignorados silenciosamente.
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - event_ids
	 *             properties:
	 *               event_ids:
	 *                 type: array
	 *                 items:
	 *                   type: integer
	 *                 minItems: 1
	 *                 maxItems: 100
	 *                 description: Lista de IDs de eventos para reprocessar
	 *     responses:
	 *       200:
	 *         description: Eventos agendados para reprocessamento
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 message:
	 *                   type: string
	 *                 requested:
	 *                   type: integer
	 *                 replayed:
	 *                   type: integer
	 *                 events:
	 *                   type: array
	 *                   items:
	 *                     type: object
	 *                 warning:
	 *                   type: string
	 */
	async replayBatch(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const { event_ids } = replayBatchSchema.parse(req.body);
			const result = await replayService.replayBatch(event_ids);
			res.json(result);
		} catch (err) {
			next(err);
		}
	}
}

export const replayController = new ReplayController();
