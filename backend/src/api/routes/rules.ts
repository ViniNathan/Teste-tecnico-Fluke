import { Router } from 'express';
import { ruleController } from '../controllers/rule.controller';

const router = Router();

// POST /rules - cria uma nova regra
router.post('/', ruleController.create.bind(ruleController));

// GET /rules - lista todas as regras
router.get('/', ruleController.list.bind(ruleController));

// GET /rules/:id - detalhes da regra
router.get('/:id', ruleController.getById.bind(ruleController));

// PUT /rules/:id - atualiza uma regra
router.put('/:id', ruleController.update.bind(ruleController));

// DELETE /rules/:id - desativa uma regra
router.delete('/:id', ruleController.delete.bind(ruleController));

// GET /rules/:id/versions - histórico de versões
router.get('/:id/versions', ruleController.getVersions.bind(ruleController));

export { router as rulesRouter };
