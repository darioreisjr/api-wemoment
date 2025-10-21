const { Router } = require('express');
const router = Router();

// Importa os módulos de rotas
const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const eventRoutes = require('./event.routes'); // Certifique-se que este arquivo existe e não tem erros internos
const wishRoutes = require('./wish.routes');
const noteRoutes = require('./note.routes');
const photoRoutes = require('./photo.routes');

// Rota de "saúde" (health check) - Deve ser uma função
router.get('/', (req, res) => {
    res.send('Olá! A API está no ar.');
});

// Agrupa as rotas por recurso
// Verifica se cada variável importada é realmente um router ou função válida
if (typeof authRoutes !== 'function') console.error('⚠️ authRoutes não carregou corretamente!');
router.use('/auth', authRoutes);

if (typeof profileRoutes !== 'function') console.error('⚠️ profileRoutes não carregou corretamente!');
router.use('/profile', profileRoutes);

if (typeof eventRoutes !== 'function') {
  console.error('⚠️ eventRoutes não carregou corretamente! Verifique api/routes/event.routes.js');
  // Você pode adicionar um tratamento de erro aqui se necessário,
  // mas o ideal é corrigir a importação ou o arquivo event.routes.js
} else {
  router.use('/events', eventRoutes); // Linha 23 original do erro
}


if (typeof wishRoutes !== 'function') console.error('⚠️ wishRoutes não carregou corretamente!');
router.use('/wishes', wishRoutes);

if (typeof noteRoutes !== 'function') console.error('⚠️ noteRoutes não carregou corretamente!');
router.use('/notes', noteRoutes);

if (typeof photoRoutes !== 'function') console.error('⚠️ photoRoutes não carregou corretamente!');
router.use('/photos', photoRoutes);

module.exports = router;