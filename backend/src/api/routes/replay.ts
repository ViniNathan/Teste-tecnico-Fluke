import { Router } from 'express';
import { replayController } from '../controllers/replay.controller';

const router = Router();

// POST /events/:id/replay - reprocessa um evento
router.post('/:id/replay', replayController.replayEvent.bind(replayController));

// POST /events/replay-batch - reprocessa múltiplos eventos
router.post(
	'/replay-batch',
	replayController.replayBatch.bind(replayController),
);

export { router as replayRouter };
