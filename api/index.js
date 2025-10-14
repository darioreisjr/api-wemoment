// Importa as bibliotecas necessárias
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const express = require('express');
const cors = require('cors'); // Importa a biblioteca CORS
const { createClient } = require('@supabase/supabase-js');

// Inicializa o aplicativo Express
const app = express();

// --- CONFIGURAÇÃO DINÂMICA DO CORS ---
// Lista de origens (domínios) que têm permissão para acessar esta API
const allowedOrigins = [
  process.env.CLIENT_URL_DEV,
  process.env.CLIENT_URL_PROD
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permite requisições sem 'origin' (ex: Postman, apps mobile) ou se a origem estiver na lista
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Acesso não permitido por CORS'));
    }
  }
};

app.use(cors(corsOptions)); // Habilita o CORS com as opções dinâmicas
// ------------------------------------

app.use(express.json()); // Middleware para o Express entender requisições com corpo em JSON

// Pega a URL e a Chave do Supabase do arquivo .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Cria um cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.sendStatus(401); // Não Autorizado
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
        return res.status(403).json({ error: 'Token inválido ou expirado.' }); // Forbidden
    }

    req.user = user;
    next();
};

// Rota de teste para garantir que o servidor está funcionando
app.get('/api', (req, res) => {
    res.send('Olá! A API está no ar.');
});

// Endpoint para criar um novo usuário (Sign Up)
app.post('/api/auth/signup', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ user: data.user, message: 'Usuário criado com sucesso! Verifique seu e-mail para confirmação.' });
});

// Endpoint para autenticar um usuário (Sign In / Login)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        return res.status(401).json({ error: error.message }); // Unauthorized
    }
    
    // Modificado para retornar o token e o usuário diretamente, como o frontend espera
    res.status(200).json({ 
        token: data.session.access_token,
        user: data.user,
        message: 'Login realizado com sucesso!' 
    });
});

// Endpoint protegido para obter dados do perfil do usuário
app.get('/api/profile', authenticateToken, (req, res) => {
    const userProfile = req.user;
    res.status(200).json({
        id: userProfile.id,
        email: userProfile.email,
        created_at: userProfile.created_at
    });
});

// Endpoint para iniciar o processo de redefinição de senha
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'O e-mail é obrigatório.' });
    }
    
    // A URL de redirecionamento deve apontar para a página de redefinição de senha no seu frontend
    const resetUrl = `${process.env.CLIENT_URL_PROD}/update-password`; 

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetUrl,
    });

    if (error) {
        console.error('Erro na redefinição de senha:', error);
    }

    res.status(200).json({
        message: 'Se um usuário com este e-mail existir, um link para redefinição de senha será enviado.'
    });
});

// Inicia o servidor para escutar em uma porta
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

// Exporta o app para a Vercel
module.exports = app;