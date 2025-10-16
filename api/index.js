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
    const { email, password, firstName, lastName, gender, birth_year } = req.body; // Adicionado birth_year

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
                gender: gender,
                birth_year: birth_year // Adicionado birth_year
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

// ==================================================================
//  CORREÇÃO PRINCIPAL: GARANTIR QUE a `avatar_url` SEJA ENVIADA
// ==================================================================
app.get('/api/profile', authenticateToken, async (req, res) => {
    const user = req.user;
    
    // CORREÇÃO: Adicionado 'avatar_url' e 'birth_year' à lista de campos a serem selecionados.
    const { data: profileData, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, gender, avatar_url, birth_year') // Adicionado birth_year
        .eq('user_id', user.id)
        .single();

    if (error && error.code !== 'PGRST116') { // Ignora o erro se o perfil ainda não existir
        console.error('Erro ao buscar perfil:', error);
        return res.status(500).json({ error: 'Não foi possível buscar os dados do perfil.' });
    }

    const userProfile = {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        firstName: profileData?.first_name,
        lastName: profileData?.last_name,
        gender: profileData?.gender,
        avatar: profileData?.avatar_url, // Mapeia a coluna 'avatar_url' para o campo 'avatar' esperado pelo frontend
        birth_year: profileData?.birth_year, // Adicionado birth_year
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

app.patch('/api/profile', authenticateToken, async (req, res) => {
    const user = req.user;
    const { firstName, lastName, gender, avatar_url, birth_year } = req.body; // Adicionado birth_year

    // Constrói o objeto de dados apenas com os campos que foram enviados
    const profileData = {};
    if (firstName) profileData.first_name = firstName;
    if (lastName) profileData.last_name = lastName;
    if (gender) profileData.gender = gender;
    if (avatar_url) profileData.avatar_url = avatar_url;
    if (birth_year) profileData.birth_year = birth_year; // Adicionado birth_year


    try {
        const { data: updatedData, error: updateError } = await supabase
            .from('profiles')
            .update(profileData)
            .eq('user_id', user.id)
            .select()
            .single();

        if (updateError && updateError.code === 'PGRST116') { // Se o perfil não existir, cria um novo
            const { data: insertedData, error: insertError } = await supabase
                .from('profiles')
                .insert({
                    user_id: user.id,
                    ...profileData
                })
                .select()
                .single();

            if (insertError) {
                throw insertError;
            }

            return res.status(201).json({ message: 'Perfil criado e atualizado com sucesso!', profile: insertedData });
        }

        if (updateError) {
            throw updateError;
        }

        res.status(200).json({ message: 'Perfil atualizado com sucesso!', profile: updatedData });

    } catch (error) {
        console.error('Erro no endpoint PATCH /api/profile:', error);
        return res.status(500).json({ error: 'Não foi possível salvar as informações do perfil.' });
    }
});

app.post('/api/profile/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    const user = req.user;

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
    }

    try {
        const file = req.file;
        const fileExt = file.originalname.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('avatars')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: true
            });

        if (uploadError) {
            console.error('Erro no upload para o Supabase:', uploadError);
            return res.status(500).json({ error: `Erro do Supabase Storage: ${uploadError.message}` });
        }

        const { data: urlData } = supabase
            .storage
            .from('avatars')
            .getPublicUrl(filePath);

        if (!urlData || !urlData.publicUrl) {
            throw new Error('Não foi possível obter a URL pública da imagem.');
        }

        const publicUrl = urlData.publicUrl;

        // Opcional: Atualiza o perfil imediatamente após o upload. 
        // A lógica principal de salvar está agora no PATCH /api/profile
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('user_id', user.id);

        if (profileError) {
            console.error('Erro ao atualizar o perfil:', profileError);
            throw new Error('Não foi possível salvar a URL do avatar no perfil.');
        }

        res.status(200).json({ message: 'Avatar enviado com sucesso!', avatarUrl: publicUrl });

    } catch (error) {
        console.error('Erro no endpoint de upload de avatar:', error);
        res.status(500).json({ error: error.message || 'Ocorreu um erro interno no servidor.' });
    }
});


// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

module.exports = app;