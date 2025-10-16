// Importa as bibliotecas necessárias
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const express = require('express');
const cors = require('cors'); // Importa a biblioteca CORS
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer'); // Importe o multer

// Configuração do multer para armazenamento em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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

// Rota de teste
app.get('/api', (req, res) => {
    res.send('Olá! A API está no ar.');
});

// Endpoint para criar um novo usuário (Sign Up)
app.post('/api/auth/signup', async (req, res) => {
    const { email, password, firstName, lastName, gender } = req.body;

    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'Email, senha, nome e sobrenome são obrigatórios.' });
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
    });

    if (authError) {
        if (authError.message.includes('unique constraint')) {
            return res.status(409).json({ message: 'Este email já está cadastrado.' });
        }
        return res.status(400).json({ error: authError.message });
    }

    if (authData.user) {
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                user_id: authData.user.id,
                first_name: firstName,
                last_name: lastName,
                gender: gender
            });

        if (profileError) {
            await supabase.auth.admin.deleteUser(authData.user.id);
            console.error('Erro ao criar perfil, usuário revertido:', profileError);
            return res.status(500).json({ error: 'Ocorreu um erro ao salvar os dados do perfil.' });
        }
    } else {
        return res.status(500).json({ error: 'Usuário não foi criado, perfil não pode ser salvo.' });
    }

    res.status(201).json({ user: authData.user, message: 'Usuário criado com sucesso! Verifique seu e-mail.' });
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
        return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    res.status(200).json({
        token: data.session.access_token,
        user: data.user,
        message: 'Login realizado com sucesso!'
    });
});

// Endpoint para obter dados do perfil do usuário
app.get('/api/profile', authenticateToken, async (req, res) => {
    const user = req.user;
    const { data: profileData, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, gender')
        .eq('user_id', user.id)
        .single();

    if (error) {
        console.error('Erro ao buscar perfil:', error);
        return res.status(500).json({ error: 'Não foi possível buscar os dados do perfil.' });
    }

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

// Endpoint para redefinição de senha
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'O e-mail é obrigatório.' });
    }
    const resetUrl = `${process.env.CLIENT_URL_PROD}/update-password`;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetUrl });
    res.status(200).json({ message: 'Se um usuário com este e-mail existir, um link será enviado.' });
});


// ==================================================================
//  ATUALIZAÇÃO PRINCIPAL - LÓGICA MAIS ROBUSTA PARA ATUALIZAR/CRIAR
// ==================================================================
app.patch('/api/profile', authenticateToken, async (req, res) => {
    const user = req.user;
    const { firstName, lastName, gender } = req.body;

    const profileData = {
        first_name: firstName,
        last_name: lastName,
        gender: gender,
    };

    try {
        // 1. Tenta atualizar o perfil existente
        const { data: updatedData, error: updateError } = await supabase
            .from('profiles')
            .update(profileData)
            .eq('user_id', user.id)
            .select()
            .single();

        // Se a atualização falhou porque o perfil não existe (erro comum), cria um novo.
        if (updateError && updateError.code === 'PGRST116') {
            const { data: insertedData, error: insertError } = await supabase
                .from('profiles')
                .insert({
                    user_id: user.id,
                    ...profileData
                })
                .select()
                .single();

            if (insertError) {
                throw insertError; // Lança o erro de inserção se ocorrer
            }

            return res.status(201).json({ message: 'Perfil criado e atualizado com sucesso!', profile: insertedData });
        }

        // Se houve outro tipo de erro na atualização
        if (updateError) {
            throw updateError;
        }

        res.status(200).json({ message: 'Perfil atualizado com sucesso!', profile: updatedData });

    } catch (error) {
        console.error('Erro no endpoint PATCH /api/profile:', error);
        return res.status(500).json({ error: 'Não foi possível salvar as informações do perfil.' });
    }
});

// ==================================================================
//  ENDPOINT PARA UPLOAD DE AVATAR
// ==================================================================
app.post('/api/profile/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    const user = req.user;

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
    }

    try {
        const file = req.file;
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;

        // Faz o upload do arquivo para o Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('avatars') // O nome do seu bucket
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: true // Se um arquivo com o mesmo nome existir, ele será substituído
            });

        if (uploadError) {
            console.error('Erro no upload para o Supabase:', uploadError);
            throw new Error('Não foi possível fazer o upload da imagem.');
        }

        // Obtém a URL pública da imagem que acabamos de enviar
        const { data: urlData } = supabase
            .storage
            .from('avatars')
            .getPublicUrl(fileName);

        if (!urlData || !urlData.publicUrl) {
            throw new Error('Não foi possível obter a URL pública da imagem.');
        }

        const publicUrl = urlData.publicUrl;

        // Atualiza a tabela 'profiles' com a nova URL do avatar
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('user_id', user.id);

        if (profileError) {
            console.error('Erro ao atualizar o perfil:', profileError);
            throw new Error('Não foi possível salvar a URL do avatar no perfil.');
        }

        res.status(200).json({ message: 'Avatar atualizado com sucesso!', avatarUrl: publicUrl });

    } catch (error) {
        console.error('Erro no endpoint de upload de avatar:', error);
        res.status(500).json({ error: error.message || 'Ocorreu um erro interno.' });
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

// Exporta o app para a Vercel
module.exports = app;