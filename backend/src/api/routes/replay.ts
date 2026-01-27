// backend/src/api/routes/replay.ts
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../../db/client';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const router = Router();
const replayLogger = createLogger({ module: 'replay' });

// POST /events/:id/replay - reprocessa um evento
// IMPORTANTE:
// - Apenas eventos em estado 'processed' ou 'failed' podem ser reprocessados
// - A "reprocessação" criará um novo tentativa
// - As ações serão executadas novamente (NÃO idempotentes!)
// - As versões atuais das regras serão usadas (podem diferir das originais)
// - Casos de uso:
//   - Retentar eventos falhados após correção de bug
//   - Reprocessar com regras atualizadas
//   - Recuperar de falhas transitórias
router.post('/:id/replay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = parseInt(req.params.id as string, 10);

    if (isNaN(eventId)) {
      throw new ValidationError('Invalid event ID');
    }

    replayLogger.info({ eventId }, 'Replay requested');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Obtém o evento
      const eventResult = await client.query(
        'SELECT * FROM events WHERE id = $1',
        [eventId]
      );

      if (eventResult.rows.length === 0) {
        throw new NotFoundError(`Event with ID ${eventId} not found`);
      }

      const event = eventResult.rows[0];

      // 2. Valida o estado (apenas eventos em estado 'processed' ou 'failed' podem ser reprocessados)
      if (!['processed', 'failed'].includes(event.state)) {
        throw new ConflictError(
          `Cannot replay event in state '${event.state}'. Only 'processed' or 'failed' events can be replayed.`
        );
      }

      // 3. Atualiza o estado para 'pending' e define o timestamp replayed_at
      const updateResult = await client.query(
        `
        UPDATE events 
        SET state = 'pending', replayed_at = NOW()
        WHERE id = $1
        RETURNING id, external_id, type, state, replayed_at
        `,
        [eventId]
      );

      await client.query('COMMIT');

      const updatedEvent = updateResult.rows[0];

      replayLogger.info(
        { eventId, previousState: event.state },
        'Event queued for replay'
      );

      res.json({
        message: 'Event queued for replay',
        event: updatedEvent,
        warning: 'Actions will be executed again. This may cause side effects (e.g., duplicate emails).',
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

// POST /events/replay-batch - reprocessa múltiplos eventos
router.post('/replay-batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { event_ids } = req.body;

    if (!Array.isArray(event_ids) || event_ids.length === 0) {
      throw new ValidationError('event_ids must be a non-empty array');
    }

    if (event_ids.length > 100) {
      throw new ValidationError('Cannot replay more than 100 events at once');
    }

    // Valida se todos os IDs são números
    const validIds = event_ids.every((id) => Number.isInteger(id));
    if (!validIds) {
      throw new ValidationError('All event_ids must be integers');
    }

    replayLogger.info({ count: event_ids.length }, 'Batch replay requested');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Atualiza todos os eventos para 'pending'
      const result = await client.query(
        `
        UPDATE events 
        SET state = 'pending', replayed_at = NOW()
        WHERE id = ANY($1::int[])
          AND state IN ('processed', 'failed')
        RETURNING id, external_id, state
        `,
        [event_ids]
      );

      await client.query('COMMIT');

      replayLogger.info(
        { requested: event_ids.length, replayed: result.rows.length },
        'Batch replay completed'
      );

      res.json({
        message: 'Events queued for replay',
        requested: event_ids.length,
        replayed: result.rows.length,
        events: result.rows,
        warning: 'Actions will be executed again for all events.',
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

export { router as replayRouter };