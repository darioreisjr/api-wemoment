const { Router } = require('express');
const router = Router();
const { listWishes, createWish, updateWish, deleteWish } = require('../controllers/wish.controller');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', listWishes);
router.post('/', createWish);
router.put('/:id', updateWish);
router.delete('/:id', deleteWish);

module.exports = router;