// Importa as bibliotecas necessárias
require('dotenv').config(); // Carrega as variáveis de ambiente
const express = require('express');
const cors = require('cors');
const corsOptions = require('./config/cors'); // Importa a configuração de CORS
const allRoutes = require('./routes'); // Importa o roteador principal

// Inicializa o aplicativo Express
const app = express();

// --- CONFIGURAÇÃO DE MIDDLEWARE GLOBAL ---
app.use(cors(corsOptions)); // Aplica as opções de CORS
app.use(express.json()); // Middleware para o Express entender JSON

// --- ROTAS ---
// Monta todas as rotas importadas sob o prefixo /api
app.use('/api', allRoutes);

// --- INICIALIZAÇÃO DO SERVIDOR ---
// Necessário para rodar localmente. A Vercel gerencia isso em produção.
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

// Exporta o 'app' para ser usado pela Vercel
module.exports = app;