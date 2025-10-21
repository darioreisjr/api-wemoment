const { Router } = require('express');
const router = Router();
const { listEvents, createEvent, updateEvent, deleteEvent } = require('../controllers/event.controller');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken); // Aplica autenticação a todas as rotas abaixo

router.get('/', listEvents);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;