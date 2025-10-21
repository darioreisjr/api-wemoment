const supabase = require('../config/supabase');

const getProfile = async (req, res) => {
    const user = req.user;
    
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
        dateOfBirth: profileData?.date_of_birth,
    };

    res.status(200).json(userProfile);
};

const updateProfile = async (req, res) => {
    const user = req.user;
    const { firstName, lastName, gender, avatar_url, date_of_birth } = req.body;

    const profileData = {};
    if (firstName) profileData.first_name = firstName;
    if (lastName) profileData.last_name = lastName;
    if (gender) profileData.gender = gender;
    if (avatar_url) profileData.avatar_url = avatar_url;
    if (date_of_birth) profileData.date_of_birth = date_of_birth;

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
};

const uploadAvatar = async (req, res) => {
    const user = req.user;

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
    }

    try {
        const file = req.file;
        const fileExt = file.originalname.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase
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
};

module.exports = {
    getProfile,
    updateProfile,
    uploadAvatar
};