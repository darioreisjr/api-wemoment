// Importa as bibliotecas necessárias
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const express = require('express');
const cors = require('cors'); // Importa a biblioteca CORS
const { createClient } = require('@supabase/supabase-js');

// Inicializa o aplicativo Express
const app = express();

// --- CONFIGURAÇÃO DINÂMICA DO CORS ---
const allowedOrigins = [
  process.env.CLIENT_URL_DEV,
  process.env.CLIENT_URL_PROD
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Acesso não permitido por CORS'));
    }
  }
};

app.use(cors(corsOptions));
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

// ==================================================================
//  ATUALIZAÇÃO PRINCIPAL - ENDPOINT DE CADASTRO (SIGN UP)
// ==================================================================
app.post('/api/auth/signup', async (req, res) => {
    // Agora pegamos também os novos campos do corpo da requisição
    const { email, password, firstName, lastName, gender } = req.body;

    // Validação básica para os campos obrigatórios
    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'Email, senha, nome e sobrenome são obrigatórios.' });
    }

    // 1. Cria o usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
    });

    if (authError) {
        // Retorna erro específico se o email já existe
        if (authError.message.includes('unique constraint')) {
            return res.status(409).json({ message: 'Este email já está cadastrado.' });
        }
        return res.status(400).json({ error: authError.message });
    }
    
    // Se o usuário foi criado na autenticação, authData.user não será nulo
    if (authData.user) {
        // 2. Insere os dados adicionais na tabela 'profiles'
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({ 
                user_id: authData.user.id, // Vincula com o ID do usuário recém-criado
                first_name: firstName,
                last_name: lastName,
                gender: gender // Será nulo se não for enviado, o que é permitido
            });

        if (profileError) {
            // Se a inserção no perfil falhar, é uma boa prática deletar o usuário recém-criado para evitar inconsistência.
            await supabase.auth.admin.deleteUser(authData.user.id);
            console.error('Erro ao criar perfil, usuário revertido:', profileError);
            return res.status(500).json({ error: 'Ocorreu um erro ao salvar os dados do perfil. O cadastro foi cancelado.' });
        }

    } else {
        // Caso raro onde o usuário de autenticação não é retornado, mas sem erro.
        return res.status(500).json({ error: 'Usuário não foi criado, perfil não pode ser salvo.' });
    }

    res.status(201).json({ user: authData.user, message: 'Usuário criado com sucesso! Verifique seu e-mail para confirmação.' });
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
        return res.status(401).json({ error: 'Email ou senha inválidos' }); // Unauthorized
    }
    
    res.status(200).json({ 
        token: data.session.access_token,
        user: data.user,
        message: 'Login realizado com sucesso!' 
    });
});

// Endpoint protegido para obter dados do perfil do usuário
app.get('/api/profile', authenticateToken, async (req, res) => {
    const user = req.user;

    // Busca os dados correspondentes na tabela 'profiles'
    const { data: profileData, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, gender')
        .eq('user_id', user.id)
        .single();

    if (error) {
        console.error('Erro ao buscar perfil:', error);
        return res.status(500).json({ error: 'Não foi possível buscar os dados do perfil.' });
    }

    // Combina os dados de autenticação com os dados do perfil
    const userProfile = {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        firstName: profileData.first_name,
        lastName: profileData.last_name,
        gender: profileData.gender
    };

    res.status(200).json(userProfile);
});

// Endpoint para iniciar o processo de redefinição de senha
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'O e-mail é obrigatório.' });
    }
    
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

// Endpoint para ATUALIZAR os dados do perfil do usuário
app.patch('/api/profile', authenticateToken, async (req, res) => {
    const user = req.user;
    const { firstName, lastName, gender } = req.body;

    if (!firstName && !lastName && !gender) {
        return res.status(400).json({ error: 'Nenhum dado fornecido para atualização.' });
    }

    const profileDataToUpdate = {};
    if (firstName) profileDataToUpdate.first_name = firstName;
    if (lastName) profileDataToUpdate.last_name = lastName;
    if (gender !== undefined) profileDataToUpdate.gender = gender;

    const { data, error } = await supabase
        .from('profiles')
        .update(profileDataToUpdate)
        .eq('user_id', user.id)
        .select();

    if (error) {
        console.error('Erro ao atualizar perfil:', error);
        return res.status(500).json({ error: 'Não foi possível atualizar o perfil.' });
    }

    res.status(200).json({ message: 'Perfil atualizado com sucesso!', profile: data });
});


// Inicia o servidor para escutar em uma porta
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

// Exporta o app para a Vercel
module.exports = app;