const { Router } = require('express');
const router = Router();
const { getProfile, updateProfile, uploadAvatar } = require('../controllers/profile.controller');
const authenticateToken = require('../middleware/auth');
const upload = require('../config/multer');

router.get('/', authenticateToken, getProfile);
router.patch('/', authenticateToken, updateProfile);
router.post('/avatar', authenticateToken, upload.single('avatar'), uploadAvatar);

module.exports = router;