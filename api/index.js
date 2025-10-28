// Importa as bibliotecas necessárias
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const express = require('express');
const cors = require('cors'); // Importa a biblioteca CORS
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer'); // Importe o multer
const crypto = require('crypto'); // Para gerar códigos de convite
const { v4: uuidv4 } = require('uuid'); // Para gerar UUIDs (couple_id)

// Configuração do multer para armazenamento em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Inicializa o aplicativo Express
const app = express();

// --- CONFIGURAÇÃO DINÂMICA DO CORS ---
const allowedOrigins = [
    process.env.CLIENT_URL_DEV,
    process.env.CLIENT_URL_PROD
].filter(Boolean); // Filtra valores undefined/null

// Adiciona localhost dinamicamente se não estiver em produção estrita
if (process.env.NODE_ENV !== 'production' && !allowedOrigins.some(origin => origin?.includes('localhost'))) {
    // Tenta obter a porta do .env ou usa 5173 como padrão para CLIENT_URL_DEV (porta padrão do Vite)
    const devPort = process.env.CLIENT_PORT_DEV || 5173; // Ajustado para porta comum do Vite
    if (process.env.CLIENT_URL_DEV && process.env.CLIENT_URL_DEV.includes('localhost')) {
       // Se CLIENT_URL_DEV já inclui localhost, usa essa porta
       allowedOrigins.push(process.env.CLIENT_URL_DEV);
    } else {
       // Caso contrário, adiciona com a porta padrão/configurada
       allowedOrigins.push(`http://localhost:${devPort}`);
       allowedOrigins.push(`http://127.0.0.1:${devPort}`);
    }
}


const corsOptions = {
    origin: function (origin, callback) {
        // Permite requisições sem 'origin' (ex: Postman, mobile apps, server-to-server) OU se a origem está na lista
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`Origem não permitida bloqueada por CORS: ${origin}`); // Log para debug
            callback(new Error('Acesso não permitido por CORS'));
        }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Métodos permitidos
    allowedHeaders: "Content-Type,Authorization,X-Requested-With" // Cabeçalhos permitidos
};


app.use(cors(corsOptions));
// // Habilita pre-flight requests para todas as rotas
// app.options('*', cors(corsOptions));
// // ------------------------------------

app.use(express.json()); // Middleware para o Express entender requisições com corpo em JSON

// --- Configuração do Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    console.error("ERRO FATAL: Variáveis de ambiente do Supabase (URL, ANON_KEY, SERVICE_ROLE_KEY) não estão definidas.");
    process.exit(1); // Encerra a aplicação se as chaves não estiverem configuradas
}

// Cliente Supabase para operações do usuário autenticado (usando Anon Key)
const supabase = createClient(supabaseUrl, supabaseKey);
// Cliente Supabase com privilégios de admin (usando Service Role Key)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
     auth: {
        // Impede que o cliente admin tente gerenciar sessões de usuário
        autoRefreshToken: false,
        persistSession: false
    }
});
// ---------------------------------


// Middleware de autenticação
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        console.warn("Tentativa de acesso sem token.");
        return res.status(401).json({ error: 'Token não fornecido.' }); // Não Autorizado
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) { // Verifica se o usuário existe
         console.warn(`Falha na autenticação do token: ${error?.message || 'Usuário não encontrado'}`);
        // Retorna 403 para indicar que o token existe mas é inválido/expirado
        return res.status(403).json({ error: 'Token inválido ou expirado.' }); // Forbidden
    }

    req.user = user; // Anexa o objeto user à requisição
    next(); // Passa para a próxima função de middleware ou rota
};

// --- Funções Auxiliares ---

/**
 * Busca o perfil de um usuário específico pelo ID.
 * Usa o cliente admin para poder buscar qualquer perfil.
 * @param {string} userId - O UUID do usuário a ser buscado.
 * @returns {Promise<object|null>} Objeto com dados do perfil ou null.
 */
async function fetchUserProfile(userId) {
    if (!userId) return null;
    try {
        const { data: profileData, error } = await supabaseAdmin
            .from('profiles')
            // Certifique-se de que relationship_start_date existe na sua tabela profiles
            .select('user_id, first_name, last_name, gender, avatar_url, date_of_birth, partner_id, couple_id, relationship_start_date')
            .eq('user_id', userId)
            .maybeSingle(); // Retorna null em vez de erro se não encontrar

        if (error) {
            console.error(`Erro ao buscar perfil para ${userId}:`, error.message);
            return null; // Retorna null em caso de erro
        }
        // Retorna o perfil formatado ou null
        return profileData ? {
            id: profileData.user_id, // Garante que o ID do usuário está presente
            firstName: profileData.first_name,
            lastName: profileData.last_name,
            gender: profileData.gender,
            avatar: profileData.avatar_url,
            dateOfBirth: profileData.date_of_birth,
            partnerId: profileData.partner_id,
            coupleId: profileData.couple_id,
            relationshipStartDate: profileData.relationship_start_date // Adicionado
        } : null;
    } catch (err) {
        console.error(`Exceção ao buscar perfil para ${userId}:`, err);
        return null;
    }
}


// --- Rotas ---

// Rota de teste
app.get('/api', (req, res) => {
    res.send('Olá! A API WeMoment está operacional.');
});

// Endpoint para criar um novo usuário (Sign Up)
app.post('/api/auth/signup', async (req, res) => {
    const { email, password, firstName, lastName, gender, date_of_birth } = req.body;

    // Validações básicas
    if (!email || !password || !firstName || !lastName || !gender) {
        return res.status(400).json({ error: 'Email, senha, nome, sobrenome e gênero são obrigatórios.' });
    }
     if (password.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    // Tenta criar o usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
    });

    if (authError) {
        if (authError.message && (authError.message.includes('unique constraint') || authError.message.toLowerCase().includes('already registered'))) {
            return res.status(409).json({ message: 'Este email já está cadastrado.' }); // Conflict
        }
        console.error('Erro no Supabase SignUp:', authError);
        return res.status(400).json({ error: authError.message || 'Erro ao criar usuário.' });
    }

    // Garante que authData.user não é null antes de prosseguir
    if (authData.user) {
         // Tenta inserir o perfil usando o cliente Admin (Service Role)
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
                user_id: authData.user.id, // Chave primária/estrangeira
                first_name: firstName,
                last_name: lastName,
                gender: gender,
                date_of_birth: date_of_birth || null // Salva null se não fornecido
            });

        if (profileError) {
            // Se falhar ao criar o perfil, tenta reverter a criação do usuário Auth
            console.error('Erro ao criar perfil após signup:', profileError);
            try {
                const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
                 if (deleteError) {
                    console.error('Falha CRÍTICA ao reverter criação de usuário após erro no perfil:', deleteError);
                 } else {
                     console.log(`Usuário auth ${authData.user.id} revertido devido a erro na criação do perfil.`);
                 }
            } catch (adminDeleteError) {
                console.error('Exceção ao tentar reverter criação de usuário:', adminDeleteError);
            }
            return res.status(500).json({ error: 'Ocorreu um erro ao salvar os dados do perfil. O cadastro foi cancelado.' });
        }
        // Resposta de sucesso após criar usuário e perfil
         res.status(201).json({ user: authData.user, message: 'Usuário criado com sucesso! Verifique seu e-mail para confirmação.' });

    } else {
        // Caso inesperado onde auth.signUp retorna sucesso mas sem usuário
         console.error('Supabase SignUp retornou sucesso mas sem dados de usuário.');
         return res.status(500).json({ error: 'Falha ao obter dados do usuário após o cadastro. Tente novamente.' });
    }
});


// Endpoint para autenticar um usuário (Sign In / Login)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (loginError || !loginData.session || !loginData.user) {
        console.warn(`Falha no login para ${email}: ${loginError?.message || 'Dados ausentes'}`);
        return res.status(401).json({ error: 'Email ou senha inválidos.' });
    }

    try {
        // Busca o perfil do usuário logado
        const userProfile = await fetchUserProfile(loginData.user.id);
        let partnerProfile = null;

        // Se o usuário tem um partner_id, busca o perfil do parceiro
        if (userProfile && userProfile.partnerId) {
            partnerProfile = await fetchUserProfile(userProfile.partnerId);
        }

        // Monta o objeto de usuário principal para o frontend
        const mainUserFrontend = {
            id: loginData.user.id,
            email: loginData.user.email,
            created_at: loginData.user.created_at, // Pode ser útil no frontend
            // Dados do perfil (podem ser null/undefined se o perfil ainda não existir)
            firstName: userProfile?.firstName,
            lastName: userProfile?.lastName,
            gender: userProfile?.gender,
            avatar: userProfile?.avatar,
            dateOfBirth: userProfile?.dateOfBirth,
            relationshipStartDate: userProfile?.relationshipStartDate, // Adicionado
            // Info de relacionamento
            partnerId: userProfile?.partnerId, // Envia o ID do parceiro
            coupleId: userProfile?.coupleId   // Envia o ID do casal
        };

        // Monta o objeto do parceiro para o frontend (se existir)
        let partnerFrontend = null;
        if (partnerProfile) {
            partnerFrontend = {
                id: partnerProfile.id,
                firstName: partnerProfile.firstName,
                lastName: partnerProfile.lastName,
                gender: partnerProfile.gender,
                avatar: partnerProfile.avatar,
                dateOfBirth: partnerProfile.dateOfBirth,
                relationshipStartDate: partnerProfile.relationshipStartDate // Adicionado
                // Não incluir partnerId ou coupleId aqui, pois já estão no usuário principal
            };
        }

        res.status(200).json({
            token: loginData.session.access_token,
            user: mainUserFrontend, // Envia o perfil combinado do usuário principal
            partner: partnerFrontend, // Envia o perfil formatado do parceiro (pode ser null)
            message: 'Login realizado com sucesso!'
        });

    } catch (profileError) {
        console.error("Erro ao buscar perfis durante o login:", profileError);
        // Mesmo com erro no perfil, retorna o login básico se a autenticação funcionou
        res.status(200).json({
            token: loginData.session.access_token,
             // Envia dados básicos da autenticação + IDs de relacionamento se disponíveis no erro (pouco provável)
            user: {
                 id: loginData.user.id,
                 email: loginData.user.email,
                 created_at: loginData.user.created_at,
                 partnerId: null, // Default
                 coupleId: null   // Default
            },
            partner: null,
            message: 'Login realizado, mas houve um erro ao buscar detalhes do perfil.'
        });
    }
});


// Endpoint para buscar perfil do usuário autenticado e do parceiro
app.get('/api/profile', authenticateToken, async (req, res) => {
    const user = req.user; // Usuário autenticado pelo middleware

    try {
        // Busca o perfil do usuário autenticado
        const userProfile = await fetchUserProfile(user.id);
        let partnerProfile = null;

        // Se o perfil foi encontrado e tem um partnerId, busca o perfil do parceiro
        if (userProfile && userProfile.partnerId) {
            partnerProfile = await fetchUserProfile(userProfile.partnerId);
        }

        // Monta o objeto do usuário principal para enviar ao frontend
         const mainUserFrontend = {
            id: user.id,
            email: user.email, // Pega da autenticação (mais confiável)
            created_at: user.created_at, // Pega da autenticação
            // Dados do perfil (podem ser null/undefined)
            firstName: userProfile?.firstName,
            lastName: userProfile?.lastName,
            gender: userProfile?.gender,
            avatar: userProfile?.avatar,
            dateOfBirth: userProfile?.dateOfBirth,
            relationshipStartDate: userProfile?.relationshipStartDate, // Adicionado
             // Info de relacionamento
            partnerId: userProfile?.partnerId,
            coupleId: userProfile?.coupleId
        };

         // Monta o objeto do parceiro para o frontend (se existir)
        let partnerFrontend = null;
        if (partnerProfile) {
            partnerFrontend = {
                id: partnerProfile.id,
                firstName: partnerProfile.firstName,
                lastName: partnerProfile.lastName,
                gender: partnerProfile.gender,
                avatar: partnerProfile.avatar,
                dateOfBirth: partnerProfile.dateOfBirth,
                relationshipStartDate: partnerProfile.relationshipStartDate // Adicionado
                // Não incluir partnerId ou coupleId aqui
            };
        }

        res.status(200).json({
            user: mainUserFrontend,
            partner: partnerFrontend // Retorna o parceiro (pode ser null)
        });

    } catch (error) {
        console.error(`Erro ao buscar perfil completo para usuário ${user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível buscar os dados completos do perfil.' });
    }
});


// Endpoint para redefinição de senha
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'O e-mail é obrigatório.' });
    }
    // Garante que a URL base para redirecionamento está definida
    const clientUrl = process.env.CLIENT_URL_PROD || process.env.CLIENT_URL_DEV;
    if (!clientUrl) {
         console.error("Erro: CLIENT_URL_PROD ou CLIENT_URL_DEV não definida no .env para forgot-password.");
         return res.status(500).json({ error: "Configuração do servidor incompleta." });
    }
    const resetUrl = `${clientUrl}/update-password`; // O frontend DEVE ter uma rota /update-password

    // Usa o cliente Supabase normal (anon key) para esta operação
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetUrl });

     if (error) {
        // Não vaza informação se o email existe ou não, mas loga o erro no servidor
        console.error("Erro ao solicitar reset de senha:", error.message);
    }

    // Retorna sempre a mesma mensagem para o usuário por segurança
    res.status(200).json({ message: 'Se um usuário com este e-mail existir, um link para redefinição de senha será enviado.' });
});


// Endpoint para atualizar perfil do usuário autenticado
app.patch('/api/profile', authenticateToken, async (req, res) => {
    const user = req.user;
    // Campos que podem ser atualizados pelo usuário
    const { firstName, lastName, gender, avatar_url, date_of_birth, relationship_start_date } = req.body;

    const profileDataToUpdate = {};
    if (firstName !== undefined) profileDataToUpdate.first_name = firstName;
    if (lastName !== undefined) profileDataToUpdate.last_name = lastName;
    if (gender !== undefined) profileDataToUpdate.gender = gender;
    // Permite definir avatar como null explicitamente se necessário
    if (avatar_url !== undefined) profileDataToUpdate.avatar_url = avatar_url;
    // Permite definir date_of_birth como null se uma string vazia for enviada
    if (date_of_birth !== undefined) profileDataToUpdate.date_of_birth = date_of_birth || null;
    // Permite definir relationship_start_date como null se uma string vazia for enviada
    if (relationship_start_date !== undefined) profileDataToUpdate.relationship_start_date = relationship_start_date || null;


    // Verifica se há dados para atualizar
     if (Object.keys(profileDataToUpdate).length === 0) {
        // Nada a atualizar, busca e retorna o perfil atual
        try {
            const currentProfile = await fetchUserProfile(user.id);
             // Formata para o frontend antes de retornar
             const userFrontend = currentProfile ? {
                id: currentProfile.id,
                firstName: currentProfile.firstName,
                lastName: currentProfile.lastName,
                gender: currentProfile.gender,
                avatar: currentProfile.avatar,
                dateOfBirth: currentProfile.dateOfBirth,
                relationshipStartDate: currentProfile.relationshipStartDate
            } : null;
            return res.status(200).json({ message: 'Nenhum dado para atualizar.', profile: userFrontend });
        } catch (fetchErr) {
            console.error("Erro ao buscar perfil atual em PATCH vazio:", fetchErr);
            return res.status(500).json({ error: 'Erro ao buscar perfil atual.'});
        }
    }


    try {
         // Usa supabaseAdmin para garantir permissão mesmo que RLS restrinja UPDATE
         // A política RLS de UPDATE ainda garante que só o próprio usuário pode INICIAR a requisição
        const { data: updatedData, error: updateError } = await supabaseAdmin
            .from('profiles')
            .update(profileDataToUpdate)
            .eq('user_id', user.id)
            .select() // Retorna os dados atualizados
            .maybeSingle(); // Usar maybeSingle para tratar caso perfil não exista

        if (updateError) {
             console.error(`Erro ao atualizar perfil para ${user.id}:`, updateError);
             // Verifica erros específicos, como violação de constraint
             if (updateError.code === '23503') { // Foreign key violation (ex: gênero inválido?)
                 return res.status(400).json({ error: 'Dado inválido fornecido.' });
             }
            throw updateError; // Lança outros erros
        }

         let operationMessage = 'Perfil atualizado com sucesso!';
         let finalProfileData = updatedData;
         let statusCode = 200;


        // Se maybeSingle não encontrou (perfil não existia), tenta criar
        if (!updatedData) {
            console.warn(`Perfil não encontrado para ${user.id} durante PATCH, tentando criar...`);
             const { data: insertedData, error: insertError } = await supabaseAdmin
                .from('profiles')
                .insert({ user_id: user.id, ...profileDataToUpdate })
                .select()
                .single();

              if (insertError) {
                   console.error(`Erro ao TENTAR CRIAR perfil inexistente para ${user.id} durante PATCH:`, insertError);
                   throw insertError; // Lança o erro de inserção
              }
               console.log(`Perfil criado para ${user.id} durante operação PATCH.`);
               operationMessage = 'Perfil criado e atualizado com sucesso!';
               finalProfileData = insertedData;
               statusCode = 201; // Created
        }

        // Formata os dados finais para o frontend
        const profileFrontend = finalProfileData ? {
            id: finalProfileData.user_id,
            firstName: finalProfileData.first_name,
            lastName: finalProfileData.last_name,
            gender: finalProfileData.gender,
            avatar: finalProfileData.avatar_url,
            dateOfBirth: finalProfileData.date_of_birth,
            relationshipStartDate: finalProfileData.relationship_start_date
        } : null;


        res.status(statusCode).json({ message: operationMessage, profile: profileFrontend });

    } catch (error) {
        console.error('Exceção no endpoint PATCH /api/profile:', error);
        return res.status(500).json({ error: error.message || 'Não foi possível salvar as informações do perfil.' });
    }
});


// Endpoint para upload de avatar
app.post('/api/profile/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    const user = req.user;

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo de avatar foi enviado.' });
    }
     // Validação de tipo de arquivo (exemplo)
    if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Tipo de arquivo inválido. Apenas imagens são permitidas.' });
    }
    // Validação de tamanho (exemplo: 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
         return res.status(400).json({ error: 'Arquivo muito grande. O limite é 5MB.' });
    }


    try {
        const file = req.file;
        const fileExt = file.originalname.split('.').pop()?.toLowerCase() || 'png'; // Default para png se não houver extensão
        // Caminho no storage: public/<user_id>_<timestamp>.<ext> - Colocar em 'public' para URL pública fácil
        // O nome do bucket é 'avatars'
        const filePath = `public/${user.id}_${Date.now()}.${fileExt}`;

        // Upload para o bucket 'avatars' usando supabaseAdmin
        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('avatars') // Nome EXATO do bucket
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false // Não sobrescrever, timestamp garante unicidade
            });

        if (uploadError) {
            console.error('Erro no upload para o Supabase Storage:', uploadError);
            return res.status(500).json({ error: `Erro do Supabase Storage: ${uploadError.message}` });
        }

        // Obter a URL pública da imagem recém-enviada
        const { data: urlData } = supabaseAdmin
            .storage
            .from('avatars')
            .getPublicUrl(uploadData.path); // Usa o path retornado pelo upload

        if (!urlData || !urlData.publicUrl) {
            console.error('Não foi possível obter a URL pública após o upload:', uploadData.path);
            // Tenta remover o arquivo se a URL não for obtida
            try {
                 await supabaseAdmin.storage.from('avatars').remove([uploadData.path]);
                 console.log(`Arquivo ${uploadData.path} removido do storage por falha ao obter URL.`);
            } catch (removeError) {
                 console.error(`Falha ao tentar remover ${uploadData.path} do storage:`, removeError);
            }
            throw new Error('Não foi possível obter a URL pública da imagem.');
        }

        const publicUrl = urlData.publicUrl;
         console.log(`Avatar URL gerada: ${publicUrl} para usuário ${user.id}`);

        // Atualizar a coluna avatar_url na tabela profiles
         const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('user_id', user.id); // Garante que atualiza o perfil correto

        if (profileError) {
            console.error('Erro ao atualizar o perfil com a URL do avatar:', profileError);
            // Tenta remover o arquivo do storage se a atualização do perfil falhar
             try {
                 await supabaseAdmin.storage.from('avatars').remove([uploadData.path]);
                 console.log(`Arquivo ${uploadData.path} removido do storage por falha ao atualizar perfil.`);
            } catch (removeError) {
                 console.error(`Falha ao tentar remover ${uploadData.path} do storage após erro no perfil:`, removeError);
            }
            throw new Error('Não foi possível salvar a URL do avatar no perfil.');
        }

        res.status(200).json({ message: 'Avatar enviado com sucesso!', avatarUrl: publicUrl });

    } catch (error) {
        console.error('Exceção no endpoint POST /api/profile/avatar:', error);
        res.status(500).json({ error: error.message || 'Ocorreu um erro interno no servidor durante o upload do avatar.' });
    }
});


// ===============================================
// ===        ENDPOINTS - CONVITES            ===
// ===============================================

// POST /api/invite/generate - Gerar um código de convite
app.post('/api/invite/generate', authenticateToken, async (req, res) => {
    const user = req.user;

    try {
        // 1. Verificar se o usuário já tem um parceiro
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('partner_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (profileError) throw new Error(`Erro ao verificar perfil: ${profileError.message}`);
        if (profile && profile.partner_id) {
            return res.status(400).json({ error: 'Você já está vinculado a um parceiro.' });
        }

        // 2. Verificar se já existe um código válido não utilizado para este usuário
        const { data: existingCode, error: existingCodeError } = await supabaseAdmin
            .from('invite_codes')
            .select('code, expires_at')
            .eq('created_by', user.id)
            .is('used_by', null)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingCodeError) throw new Error(`Erro ao verificar código existente: ${existingCodeError.message}`);

        // Se já existe um código válido, retorna ele
        if (existingCode) {
             console.log(`Retornando código existente ${existingCode.code} para usuário ${user.id}`);
            return res.status(200).json({
                code: existingCode.code,
                expires_at: existingCode.expires_at,
                message: 'Você já possui um código de convite válido.'
            });
        }

        // 3. Gerar um novo código único (6 caracteres alfanuméricos maiúsculos)
        let newCode;
        let attempts = 0;
        const maxAttempts = 10;
        do {
            if (attempts >= maxAttempts) throw new Error("Não foi possível gerar um código único após várias tentativas.");
            newCode = crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
            attempts++;
            const { data: checkData, error: checkError } = await supabaseAdmin
                .from('invite_codes')
                .select('code')
                .eq('code', newCode)
                .maybeSingle();
            if (checkError) throw new Error(`Erro ao verificar unicidade do código: ${checkError.message}`);
            if (!checkData) break; // Código é único
             console.log(`Código ${newCode} já existe, tentando gerar outro...`);
        } while (true);

        // 4. Calcular data de expiração (7 dias a partir de agora)
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // 5. Inserir o novo código no banco de dados (usando cliente normal, pois RLS permite)
        const { data: insertedCode, error: insertError } = await supabase
            .from('invite_codes')
            .insert({
                code: newCode,
                created_by: user.id,
                expires_at: expiresAt
            })
            .select('id, code, created_by, expires_at') // Seleciona mais dados para retornar ao frontend
            .single(); // Espera um único resultado

        if (insertError) throw new Error(`Erro ao salvar código: ${insertError.message}`);

         console.log(`Código ${insertedCode.code} gerado para usuário ${user.id}`);
        // Retorna o objeto completo do código gerado (útil para o estado do frontend)
        res.status(201).json({
             inviteCode: insertedCode, // Retorna o objeto completo
             message: 'Código de convite gerado com sucesso!'
         });


    } catch (error) {
         console.error("Erro em /api/invite/generate:", error);
         res.status(500).json({ error: error.message || 'Não foi possível gerar o código de convite.' });
    }
});


// POST /api/invite/use - Utilizar um código de convite para vincular contas
app.post('/api/invite/use', authenticateToken, async (req, res) => {
    const user = req.user; // Usuário que está tentando USAR o código
    const { code } = req.body;

    if (!code || typeof code !== 'string' || code.length < 6) { // Validação básica do formato
        return res.status(400).json({ error: 'Formato de código de convite inválido.' });
    }
    const inviteCode = code.trim().toUpperCase(); // Normaliza

    try {
        // --- Validações Iniciais ---
        // 1. Verificar se o usuário (quem usa o código) já tem parceiro
        const userProfile = await fetchUserProfile(user.id); // Usar nossa função auxiliar
        if (userProfile && userProfile.partnerId) {
            return res.status(400).json({ error: 'Você já está vinculado a um parceiro.' });
        }
         // 1.1 Garante que o perfil do usuário existe (ou tenta criar um básico)
         if (!userProfile) {
              console.warn(`Usuário ${user.id} tentando usar código sem perfil existente. Criando perfil básico.`);
              const { error: createProfileError } = await supabaseAdmin
                  .from('profiles')
                  .insert({ user_id: user.id }); // Cria com user_id, outros campos ficam null
              if (createProfileError) {
                   console.error(`Falha ao criar perfil básico para ${user.id} ao usar convite:`, createProfileError);
                   throw new Error("Falha ao preparar seu perfil para vinculação.");
              }
              // Não precisa buscar de novo, as próximas operações usarão o user.id
         }


        // 2. Buscar e validar o código de convite
        const { data: codeData, error: codeError } = await supabaseAdmin
            .from('invite_codes')
            .select('id, created_by, expires_at, used_by')
            .eq('code', inviteCode)
            .maybeSingle(); // Usar maybeSingle

        if (codeError) throw new Error(`Erro ao buscar código: ${codeError.message}`);
        if (!codeData) return res.status(404).json({ error: 'Código de convite não encontrado.' });
        if (codeData.used_by) return res.status(400).json({ error: 'Este código de convite já foi utilizado.' });
        if (new Date(codeData.expires_at) < new Date()) return res.status(400).json({ error: 'Este código de convite expirou.' });
        if (codeData.created_by === user.id) return res.status(400).json({ error: 'Você não pode usar seu próprio código de convite.' });

        const partnerId = codeData.created_by; // ID do usuário que CRIOU o código

        // 3. Verificar se o criador do código já tem parceiro
        const partnerProfileCheck = await fetchUserProfile(partnerId); // Usar nossa função auxiliar
        if (partnerProfileCheck && partnerProfileCheck.partnerId) {
             console.warn(`Tentativa de usar código ${inviteCode} cujo criador ${partnerId} já está vinculado.`);
            // Invalidar este código para evitar problemas futuros
            await supabaseAdmin.from('invite_codes').update({ used_by: user.id, used_at: new Date().toISOString() }).eq('id', codeData.id);
            return res.status(400).json({ error: 'O usuário que criou este convite já está vinculado a outra pessoa.' });
        }
         // 3.1 Garante que o perfil do PARCEIRO existe (ou tenta criar um básico)
         if (!partnerProfileCheck) {
              console.warn(`Criador do código ${inviteCode} (${partnerId}) não tem perfil. Criando perfil básico.`);
              const { error: createPartnerProfileError } = await supabaseAdmin
                  .from('profiles')
                  .insert({ user_id: partnerId }); // Cria com user_id
              if (createPartnerProfileError) {
                   console.error(`Falha ao criar perfil básico para parceiro ${partnerId} ao usar convite:`, createPartnerProfileError);
                   throw new Error("Falha ao preparar o perfil do seu parceiro para vinculação.");
              }
         }


        // --- Processo de Vinculação ---
        const newCoupleId = uuidv4(); // Gera um ID único para o novo casal
        const now = new Date().toISOString();

        // 4. Atualiza o perfil do usuário que USOU o código
        const { error: updateUserError } = await supabaseAdmin
            .from('profiles')
            .update({ partner_id: partnerId, couple_id: newCoupleId })
            .eq('user_id', user.id);
        if (updateUserError) throw new Error(`Erro ao atualizar seu perfil (${user.id}): ${updateUserError.message}`);

        // 5. Atualiza o perfil do usuário que CRIOU o código (o parceiro)
        const { error: updatePartnerError } = await supabaseAdmin
            .from('profiles')
            .update({ partner_id: user.id, couple_id: newCoupleId })
            .eq('user_id', partnerId);
        if (updatePartnerError) {
            // Tenta reverter a atualização do primeiro usuário
            console.error(`Erro ao atualizar perfil do parceiro ${partnerId}. Revertendo perfil ${user.id}...`);
            await supabaseAdmin.from('profiles').update({ partner_id: null, couple_id: null }).eq('user_id', user.id);
            throw new Error(`Erro ao atualizar o perfil do parceiro (${partnerId}): ${updatePartnerError.message}`);
        }

        // 6. Marca o código como usado (usando cliente normal, RLS deve permitir esta ação específica)
        const { error: updateCodeError } = await supabase
            .from('invite_codes')
            .update({ used_by: user.id, used_at: now })
            .eq('id', codeData.id)
            // .eq('code', inviteCode); // Condição extra de segurança se a RLS for baseada no code
            .is('used_by', null); // Garante atomicidade (só atualiza se ainda não foi usado)


        if (updateCodeError) {
             // Tenta reverter as atualizações dos perfis (melhor esforço sem transação explícita no JS)
             console.error(`Falha CRÍTICA ao marcar código ${inviteCode} como usado após vincular perfis. Tentando reverter...`);
             await supabaseAdmin.from('profiles').update({ partner_id: null, couple_id: null }).eq('user_id', user.id);
             await supabaseAdmin.from('profiles').update({ partner_id: null, couple_id: null }).eq('user_id', partnerId);
            throw new Error(`Erro ao marcar código como usado: ${updateCodeError.message}`);
        }

        // --- Sucesso ---
         console.log(`Usuário ${user.id} vinculado com sucesso ao usuário ${partnerId} usando o código ${inviteCode}. Couple ID: ${newCoupleId}`);
        // Busca os dados atualizados do parceiro para retornar ao frontend
        const finalPartnerProfile = await fetchUserProfile(partnerId); // Usar nossa função auxiliar
         let partnerFrontend = null;
        if (finalPartnerProfile) {
            partnerFrontend = { // Formata para o frontend
                id: finalPartnerProfile.id,
                firstName: finalPartnerProfile.firstName,
                lastName: finalPartnerProfile.lastName,
                gender: finalPartnerProfile.gender,
                avatar: finalPartnerProfile.avatar,
                dateOfBirth: finalPartnerProfile.dateOfBirth,
                relationshipStartDate: finalPartnerProfile.relationshipStartDate
            };
        }


        res.status(200).json({
            message: 'Vínculo realizado com sucesso!',
            partner: partnerFrontend // Retorna os dados do parceiro recém-vinculado
        });

    } catch (linkError) {
        console.error(`Erro em /api/invite/use para usuário ${user.id} com código ${code}:`, linkError);
        // Garante que a mensagem de erro seja genérica no cliente por segurança
        res.status(500).json({ error: `Falha ao tentar usar o código de convite. ${linkError.message}` });
    }
});


// ===============================================
// === ENDPOINTS - EVENTOS, DESEJOS, NOTAS, FOTOS ===
// ===============================================
// !! Mantidos como estavam, associados a user_id. !!
// Adapte-os para usar couple_id se precisar de compartilhamento.

// --- Eventos ---
app.get('/api/events', authenticateToken, async (req, res) => {
    // Busca eventos CRIADOS pelo usuário atual
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', req.user.id);

    if (error) {
        console.error(`Erro ao buscar eventos para ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível buscar os eventos.' });
    }
    res.status(200).json(data || []);
});
app.post('/api/events', authenticateToken, async (req, res) => {
    const { title, description, date, location, type } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Título e data são obrigatórios.' });
    // TODO: Adicionar couple_id aqui se for implementar compartilhamento
    const { data, error } = await supabase
        .from('events')
        .insert({ user_id: req.user.id, title, description, date, location, type })
        .select().single();
    if (error) {
        console.error(`Erro ao criar evento para ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível criar o evento.' });
    }
    res.status(201).json(data);
});
app.put('/api/events/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, date, location, type } = req.body;
    // Só permite editar se for o criador original
    const { data, error } = await supabase
        .from('events')
        .update({ title, description, date, location, type })
        .eq('id', id).eq('user_id', req.user.id)
        .select().single();
    if (error) {
        console.error(`Erro ao atualizar evento ${id} por ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível atualizar o evento.' });
    }
    if (!data) return res.status(404).json({ error: 'Evento não encontrado ou não autorizado.' });
    res.status(200).json(data);
});
app.delete('/api/events/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
     // Só permite deletar se for o criador original
    const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id).eq('user_id', req.user.id);
    if (error) {
        console.error(`Erro ao deletar evento ${id} por ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível deletar o evento.' });
    }
     // Verificar se a deleção realmente ocorreu (opcional, count pode ser 0 se não autorizado/existente)
    // const { count } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('id', id);
    res.status(204).send();
});

// --- Desejos (Wishes) ---
app.get('/api/wishes', authenticateToken, async (req, res) => {
     const { data, error } = await supabase
        .from('wishes')
        .select('*')
        .eq('user_id', req.user.id) // Busca apenas os do usuário
        .order('created_at', { ascending: false });
      if (error) {
        console.error(`Erro ao buscar desejos para ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível buscar os desejos.' });
    }
     res.status(200).json(data || []);
});
app.post('/api/wishes', authenticateToken, async (req, res) => {
    const { title, description, category, priority } = req.body;
    if (!title) return res.status(400).json({ error: 'O título é obrigatório.' });
     // TODO: Adicionar couple_id aqui se for implementar compartilhamento
    const { data, error } = await supabase
        .from('wishes')
        .insert({ user_id: req.user.id, title, description, category, priority })
        .select().single();
    if (error) {
        console.error(`Erro ao criar desejo para ${req.user.id}:`, error);
        return res.status(500).json({ error: `Não foi possível criar o desejo: ${error.message}` });
    }
    res.status(201).json(data);
});
app.put('/api/wishes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, category, priority, completed } = req.body;
     // Só permite editar se for o criador original
    const { data, error } = await supabase
        .from('wishes')
        .update({ title, description, category, priority, completed, updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', req.user.id)
        .select().single();
    if (error) {
        console.error(`Erro ao atualizar desejo ${id} por ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível atualizar o desejo.' });
    }
    if (!data) return res.status(404).json({ error: 'Desejo não encontrado ou não autorizado.' });
    res.status(200).json(data);
});
app.delete('/api/wishes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
     // Só permite deletar se for o criador original
    const { error } = await supabase
        .from('wishes')
        .delete()
        .eq('id', id).eq('user_id', req.user.id);
    if (error) {
        console.error(`Erro ao deletar desejo ${id} por ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível deletar o desejo.' });
    }
    res.status(204).send();
});

// --- Anotações (Notes) ---
app.get('/api/notes', authenticateToken, async (req, res) => {
     const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', req.user.id) // Busca apenas as do usuário
        .order('updated_at', { ascending: false });
    if (error) {
        console.error(`Erro ao buscar anotações para ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível buscar as anotações.' });
    }
    res.status(200).json(data || []);
});
app.post('/api/notes', authenticateToken, async (req, res) => {
    const { title, content } = req.body;
    if (!title) return res.status(400).json({ error: 'O título é obrigatório.' });
     // TODO: Adicionar couple_id aqui se for implementar compartilhamento
    const { data, error } = await supabase
        .from('notes')
        .insert({ user_id: req.user.id, title, content })
        .select().single();
    if (error) {
        console.error(`Erro ao criar anotação para ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível criar a anotação.' });
    }
    res.status(201).json(data);
});
app.put('/api/notes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;
     // Só permite editar se for o criador original
    const { data, error } = await supabase
        .from('notes')
        .update({ title, content, updated_at: new Date().toISOString() }) // Atualiza updated_at
        .eq('id', id).eq('user_id', req.user.id)
        .select().single();
    if (error) {
        console.error(`Erro ao atualizar anotação ${id} por ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível atualizar a anotação.' });
    }
    if (!data) return res.status(404).json({ error: 'Anotação não encontrada ou não autorizada.' });
    res.status(200).json(data);
});
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
     // Só permite deletar se for o criador original
    const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id).eq('user_id', req.user.id);
    if (error) {
        console.error(`Erro ao deletar anotação ${id} por ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível deletar a anotação.' });
    }
    res.status(204).send();
});

// --- Fotos ---
app.get('/api/photos', authenticateToken, async (req, res) => {
     const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('user_id', req.user.id) // Busca apenas as do usuário
        .order('created_at', { ascending: false });
     if (error) {
        console.error(`Erro ao buscar fotos para ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível buscar as fotos.' });
    }
    res.status(200).json(data || []);
});
app.post('/api/photos', authenticateToken, upload.single('photo'), async (req, res) => {
    const { title, description } = req.body;
    const user = req.user;
    if (!req.file || !title) return res.status(400).json({ error: 'Arquivo da foto e título são obrigatórios.' });

    try {
        const file = req.file;
        const fileExt = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
        // Caminho: public/<user_id>_<timestamp>.<ext>
        const filePath = `public/${user.id}_${Date.now()}.${fileExt}`;

        // Upload para Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('photos') // Bucket 'photos'
            .upload(filePath, file.buffer, { contentType: file.mimetype });
        if (uploadError) throw uploadError;

        // Obter URL pública
        const { data: urlData } = supabaseAdmin.storage.from('photos').getPublicUrl(uploadData.path);
        if (!urlData || !urlData.publicUrl) throw new Error('URL pública não encontrada.');

        // Inserir no banco de dados
        // TODO: Adicionar couple_id aqui se for implementar compartilhamento
        const { data: dbData, error: dbError } = await supabase
            .from('photos')
            .insert({ user_id: user.id, title, description, url: urlData.publicUrl })
            .select().single();
        if (dbError) {
             // Tenta remover do storage em caso de falha no DB
             await supabaseAdmin.storage.from('photos').remove([uploadData.path]);
             console.warn(`Foto ${uploadData.path} removida do storage por falha ao inserir no DB.`);
            throw dbError;
        }
        res.status(201).json(dbData);
    } catch (error) {
        console.error(`Erro ao adicionar foto para ${user.id}:`, error);
        res.status(500).json({ error: `Não foi possível adicionar a foto: ${error.message}` });
    }
});
app.put('/api/photos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'O título é obrigatório.' });

     // Só permite editar se for o criador original
    const { data, error } = await supabase
        .from('photos')
        .update({ title, description })
        .eq('id', id).eq('user_id', req.user.id)
        .select().single();
    if (error) {
        console.error(`Erro ao atualizar foto ${id} por ${req.user.id}:`, error);
        return res.status(500).json({ error: 'Não foi possível atualizar a foto.' });
    }
    if (!data) return res.status(404).json({ error: 'Foto não encontrada ou não autorizada.' });
    res.status(200).json(data);
});
app.delete('/api/photos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    try {
        // 1. Buscar URL da foto no DB (só se for o dono)
        const { data: photoData, error: selectError } = await supabase
            .from('photos')
            .select('url')
            .eq('id', id).eq('user_id', user.id)
            .single();

        if (selectError || !photoData) {
            // Se PGRST116 (Not Found), retorna 404, senão 500
             if (selectError?.code === 'PGRST116' || !photoData) {
                return res.status(404).json({ error: 'Foto não encontrada ou você não tem permissão.' });
             }
            console.error(`Erro ao buscar foto ${id} para deletar:`, selectError);
            return res.status(500).json({ error: 'Erro ao buscar informações da foto.' });
        }

        // 2. Extrair o caminho do arquivo da URL pública
        const urlParts = photoData.url.split('/storage/v1/object/public/');
        if (urlParts.length < 2) throw new Error("URL da foto inválida ou não reconhecida.");
        const bucketAndPath = urlParts[1]; // Ex: "avatars/public/userid_timestamp.jpg"
         // Remove o nome do bucket do início, se presente
         const filePath = bucketAndPath.startsWith('photos/') ? bucketAndPath.substring('photos/'.length) : bucketAndPath;

        // 3. Deletar o registro do banco de dados PRIMEIRO
        const { error: dbError } = await supabase
            .from('photos')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id); // Confirma user_id novamente
        if (dbError) {
             console.error(`Erro ao deletar registro da foto ${id} do DB:`, dbError);
            throw new Error(`Não foi possível remover o registro da foto: ${dbError.message}`);
        }

        // 4. Se o DB foi deletado com sucesso, deletar o arquivo do Storage
        console.log(`Tentando remover arquivo do storage: ${filePath}`);
        const { error: storageError } = await supabaseAdmin.storage
            .from('photos') // Nome do bucket
            .remove([filePath]);
        if (storageError) {
             // Loga como aviso, pois o registro do DB já foi removido
             console.warn(`Aviso: Erro ao deletar arquivo ${filePath} do storage (pode já ter sido removido ou permissão):`, storageError.message);
        }

        res.status(204).send(); // Sucesso (No Content)
    } catch (error) {
        console.error(`Erro geral ao deletar foto ${id} por ${user.id}:`, error);
        res.status(500).json({ error: `Não foi possível deletar a foto: ${error.message}` });
    }
});


// --- Tratamento de Erro Genérico ---
// Adicione no final, depois de todas as rotas
app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err.stack || err);
  // Verifica se é um erro de CORS personalizado
  if (err.message === 'Acesso não permitido por CORS') {
      return res.status(403).json({ error: err.message });
  }
  // Erro genérico
  res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
});

// --- Inicialização do Servidor ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor WeMoment API rodando na porta ${port}`);
    console.log("Origens CORS permitidas:", allowedOrigins);
});

module.exports = app; // Para Vercel ou outros que precisam exportar o app