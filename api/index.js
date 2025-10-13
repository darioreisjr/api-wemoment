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

const authenticateToken = async (req, res, next) => {
    // 1. Pega o token do cabeçalho 'Authorization'
    const authHeader = req.headers['authorization'];
    // O formato esperado é "Bearer TOKEN"
    const token = authHeader && authHeader.split(' ')[1];

    // 2. Se não houver token, retorna erro 401 (Não Autorizado)
    if (token == null) {
        return res.sendStatus(401);
    }

    // 3. Verifica o token com o Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    // 4. Se o token for inválido ou expirar, o Supabase retorna um erro
    if (error) {
        return res.status(403).json({ error: 'Token inválido ou expirado.' }); // 403 Forbidden
    }

    // 5. Se o token for válido, anexa o usuário ao objeto 'req'
    // e passa para a próxima função (a lógica do endpoint)
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

// Endpoint protegido para obter dados do perfil do usuário
// Note que 'authenticateToken' é passado antes da lógica principal da rota
app.get('/api/profile', authenticateToken, (req, res) => {
    // Graças ao middleware, agora temos acesso a 'req.user'
    // que contém os dados do usuário autenticado.
    const userProfile = req.user;

    // Retorna os dados do perfil do usuário
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

    // IMPORTANTE: Aqui você deve especificar para onde o usuário será redirecionado
    // após clicar no link do e-mail. Deve ser uma página do seu frontend.
    const resetUrl = 'http://localhost:3000/update-password'; // Exemplo para desenvolvimento local

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetUrl,
    });

    if (error) {
        // Mesmo com erro, retornamos uma mensagem genérica por segurança,
        // para não revelar se um e-mail está ou não cadastrado.
        console.error('Erro na redefinição de senha:', error);
    }

    res.status(200).json({
        message: 'Se um usuário com este e-mail existir, um link para redefinição de senha será enviado.'
    });
});

// Inicia o servidor para escutar em uma porta (ex: 3000)
// Isso é útil para testes locais. A Vercel gerenciará isso no deploy.
const port = 3000;
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

// Exporta o app para a Vercel
module.exports = app;