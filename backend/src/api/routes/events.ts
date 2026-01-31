import { Router } from 'express';
import { eventController } from '../controllers/event.controller';

const router = Router();

// POST /events - ingere evento
router.post('/', eventController.create.bind(eventController));

// GET /events/stats - estatísticas agregadas (ANTES de /:id para não conflitar)
router.get('/stats', eventController.getStats.bind(eventController));

// POST /events/requeue-stuck - requeue eventos travados
router.post(
	'/requeue-stuck',
	eventController.requeueStuck.bind(eventController),
);

// GET /events/:id - detalhes do evento
router.get('/:id', eventController.getById.bind(eventController));

// GET /events - lista eventos
router.get('/', eventController.list.bind(eventController));

// GET /events/:id/attempts - histórico de tentativas
router.get('/:id/attempts', eventController.getAttempts.bind(eventController));

export { router as eventsRouter };
