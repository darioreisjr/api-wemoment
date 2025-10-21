const supabase = require('../config/supabase');

// Endpoint para criar um novo usuário (Sign Up)
const signUp = async (req, res) => {
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
                date_of_birth: date_of_birth
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
};

// Endpoint para autenticar um usuário (Sign In / Login)
const login = async (req, res) => {
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
};

// Endpoint para redefinição de senha
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'O e-mail é obrigatório.' });
    }
    const resetUrl = `${process.env.CLIENT_URL_PROD}/update-password`;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetUrl });
    res.status(200).json({ message: 'Se um usuário com este e-mail existir, um link será enviado.' });
};

module.exports = {
    signUp,
    login,
    forgotPassword
};