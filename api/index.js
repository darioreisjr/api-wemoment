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
    // Alterado para receber date_of_birth
    const { email, password, firstName, lastName, gender, date_of_birth } = req.body;

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
                date_of_birth: date_of_birth // Salva a data de nascimento completa
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


app.get('/api/profile', authenticateToken, async (req, res) => {
    const user = req.user;
    
    // Alterado para buscar date_of_birth
    const { data: profileData, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, gender, avatar_url, date_of_birth')
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
        avatar: profileData?.avatar_url,
        dateOfBirth: profileData?.date_of_birth, // Mapeia para o campo esperado pelo frontend
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
    // Alterado para receber date_of_birth
    const { firstName, lastName, gender, avatar_url, date_of_birth } = req.body;

    const profileData = {};
    if (firstName) profileData.first_name = firstName;
    if (lastName) profileData.last_name = lastName;
    if (gender) profileData.gender = gender;
    if (avatar_url) profileData.avatar_url = avatar_url;
    if (date_of_birth) profileData.date_of_birth = date_of_birth; // Adiciona a data de nascimento


    try {
        const { data: updatedData, error: updateError } = await supabase
            .from('profiles')
            .update(profileData)
            .eq('user_id', user.id)
            .select()
            .single();

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


// ===============================================
// ===          ENDPOINTS - EVENTOS           ===
// ===============================================

// GET /api/events - Listar todos os eventos do usuário autenticado
app.get('/api/events', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', req.user.id);

    if (error) {
        console.error('Erro ao buscar eventos:', error);
        return res.status(500).json({ error: 'Não foi possível buscar os eventos.' });
    }

    res.status(200).json(data);
});

// POST /api/events - Criar um novo evento
app.post('/api/events', authenticateToken, async (req, res) => {
    const { title, description, date, location, type } = req.body;

    if (!title || !date) {
        return res.status(400).json({ error: 'Título e data são obrigatórios.' });
    }

    const { data, error } = await supabase
        .from('events')
        .insert({
            user_id: req.user.id,
            title,
            description,
            date,
            location,
            type
        })
        .select(); // CORREÇÃO: Removido o .single() daqui

    if (error) {
        console.error('Erro ao criar evento:', error);
        return res.status(500).json({ error: 'Não foi possível criar o evento.' });
    }

    // Retorna o primeiro (e único) item do array de dados
    res.status(201).json(data[0]);
});

// PUT /api/events/:id - Atualizar um evento existente
app.put('/api/events/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, date, location, type } = req.body;

    const { data, error } = await supabase
        .from('events')
        .update({
            title,
            description,
            date,
            location,
            type
        })
        .eq('id', id)
        .eq('user_id', req.user.id) // Garante que o usuário só pode atualizar seus próprios eventos
        .select()
        .single();

    if (error) {
        console.error('Erro ao atualizar evento:', error);
        return res.status(500).json({ error: 'Não foi possível atualizar o evento.' });
    }
    
    if (!data) {
        return res.status(404).json({ error: 'Evento não encontrado ou você não tem permissão para editá-lo.' });
    }

    res.status(200).json(data);
});

// DELETE /api/events/:id - Deletar um evento
app.delete('/api/events/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
        .from('events')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id); // Garante que o usuário só pode deletar seus próprios eventos

    if (error) {
        console.error('Erro ao deletar evento:', error);
        return res.status(500).json({ error: 'Não foi possível deletar o evento.' });
    }

    res.status(204).send(); // 204 No Content
});

// ===============================================
// ===           ENDPOINTS - DESEJOS           ===
// ===============================================

// GET /api/wishes - Listar todos os desejos do usuário
app.get('/api/wishes', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from('wishes')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao buscar desejos:', error);
        return res.status(500).json({ error: 'Não foi possível buscar os desejos.' });
    }

    res.status(200).json(data);
});

// POST /api/wishes - Criar um novo desejo
app.post('/api/wishes', authenticateToken, async (req, res) => {
    const { title, description, category, priority } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'O título é obrigatório.' });
    }

    const { data, error } = await supabase
        .from('wishes')
        .insert({
            user_id: req.user.id,
            title,
            description,
            category,
            priority,
        })
        .select()
        .single();

    if (error) {
        console.error('Erro ao criar desejo:', error);
        return res.status(500).json({ error: 'Não foi possível criar o desejo.' });
    }

    res.status(201).json(data);
});

// PUT /api/wishes/:id - Atualizar um desejo
app.put('/api/wishes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, category, priority, completed } = req.body;

    const { data, error } = await supabase
        .from('wishes')
        .update({
            title,
            description,
            category,
            priority,
            completed,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .single();

    if (error) {
        console.error('Erro ao atualizar desejo:', error);
        return res.status(500).json({ error: 'Não foi possível atualizar o desejo.' });
    }

    if (!data) {
        return res.status(404).json({ error: 'Desejo não encontrado ou você não tem permissão.' });
    }

    res.status(200).json(data);
});

// DELETE /api/wishes/:id - Deletar um desejo
app.delete('/api/wishes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase
        .from('wishes')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);

    if (error) {
        console.error('Erro ao deletar desejo:', error);
        return res.status(500).json({ error: 'Não foi possível deletar o desejo.' });
    }

    res.status(204).send();
});


// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

module.exports = app;