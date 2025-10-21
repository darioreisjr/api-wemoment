const { Router } = require('express');
const router = Router();

// Importa os módulos de rotas
const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const eventRoutes = require('./event.routes');
const wishRoutes = require('./wish.routes');
const noteRoutes = require('./note.routes');
const photoRoutes = require('./photo.routes');

// Rota de "saúde" (health check)
router.get('/', (req, res) => {
    res.send('Olá! A API está no ar.');
});

// Agrupa as rotas por recurso
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/events', eventRoutes);
router.use('/wishes', wishRoutes);
router.use('/notes', noteRoutes);
router.use('/photos', photoRoutes);

module.exports = router;