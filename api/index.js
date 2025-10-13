// Importa as bibliotecas necessárias
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// Inicializa o aplicativo Express
const app = express();
app.use(express.json()); // Middleware para o Express entender requisições com corpo em JSON

// Pega a URL e a Chave do Supabase do arquivo .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Cria um cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Rota de teste para garantir que o servidor está funcionando
app.get('/api', (req, res) => {
    res.send('Olá! A API está no ar.');
});

// Endpoint para criar um novo usuário (Sign Up)
app.post('/api/auth/signup', async (req, res) => {
    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    // Usa o cliente Supabase para criar o usuário
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    });

    // Se houver um erro no cadastro
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    // Se o cadastro for bem-sucedido
    // Por padrão, o Supabase pode enviar um e-mail de confirmação.
    // O usuário só poderá logar após confirmar o e-mail.
    res.status(201).json({ user: data.user, message: 'Usuário criado com sucesso! Verifique seu e-mail para confirmação.' });
});

// Endpoint para autenticar um usuário (Sign In / Login)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    // Usa o cliente Supabase para fazer o login
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });

    // Se houver um erro no login
    if (error) {
        return res.status(401).json({ error: error.message }); // 401 Unauthorized
    }

    // Se o login for bem-sucedido, a 'data' conterá a sessão do usuário
    // incluindo o access_token e o refresh_token.
    res.status(200).json({ session: data.session, message: 'Login realizado com sucesso!' });
});


// Inicia o servidor para escutar em uma porta (ex: 3000)
// Isso é útil para testes locais. A Vercel gerenciará isso no deploy.
const port = 3000;
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

// Exporta o app para a Vercel
module.exports = app;