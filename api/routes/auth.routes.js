const { Router } = require('express');
const router = Router();
const { signUp, login, forgotPassword } = require('../controllers/auth.controller');

router.post('/signup', signUp);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);

module.exports = router;