const { Router } = require('express');
const router = Router();
const { listNotes, createNote, updateNote, deleteNote } = require('../controllers/note.controller');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', listNotes);
router.post('/', createNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

module.exports = router;