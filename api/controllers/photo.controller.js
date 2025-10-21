const supabase = require('../config/supabase');

const listPhotos = async (req, res) => {
    const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

    if (error) {
        return res.status(500).json({ error: 'Não foi possível buscar as fotos.' });
    }
    res.status(200).json(data);
};

const createPhoto = async (req, res) => {
    const { title, description } = req.body;
    const user = req.user;

    if (!req.file || !title) {
        return res.status(400).json({ error: 'Arquivo da foto e título são obrigatórios.' });
    }

    try {
        const file = req.file;
        const fileExt = file.originalname.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        // Upload para o Storage
        const { error: uploadError } = await supabase.storage
            .from('photos')
            .upload(filePath, file.buffer, { contentType: file.mimetype });

        if (uploadError) throw uploadError;

        // Obter URL pública
        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filePath);
        if (!urlData || !urlData.publicUrl) throw new Error('URL pública não encontrada.');

        // Inserir no banco de dados
        const { data: dbData, error: dbError } = await supabase
            .from('photos')
            .insert({
                user_id: user.id,
                title,
                description,
                url: urlData.publicUrl,
            })
            .select()
            .single();

        if (dbError) throw dbError;

        res.status(201).json(dbData);
    } catch (error) {
        console.error('Erro ao adicionar foto:', error);
        res.status(500).json({ error: `Não foi possível adicionar a foto: ${error.message}` });
    }
};

const updatePhoto = async (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'O título é obrigatório.' });
    }

    const { data, error } = await supabase
        .from('photos')
        .update({ title, description })
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .single();

    if (error) {
        return res.status(500).json({ error: 'Não foi possível atualizar a foto.' });
    }
    if (!data) {
        return res.status(404).json({ error: 'Foto não encontrada ou você não tem permissão.' });
    }
    res.status(200).json(data);
};

const deletePhoto = async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    try {
        // 1. Buscar a URL da foto
        const { data: photoData, error: selectError } = await supabase
            .from('photos')
            .select('url')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (selectError || !photoData) {
            return res.status(404).json({ error: 'Foto não encontrada ou você não tem permissão.' });
        }

        // 2. Deletar do Storage
        const filePath = photoData.url.substring(photoData.url.indexOf(user.id));
        const { error: storageError } = await supabase.storage
            .from('photos')
            .remove([filePath]);

        if (storageError) {
             console.warn('Erro ao deletar do storage:', storageError.message);
        }

        // 3. Deletar do banco de dados
        const { error: dbError } = await supabase
            .from('photos')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        res.status(204).send();
    } catch (error) {
        console.error('Erro ao deletar foto:', error);
        res.status(500).json({ error: `Não foi possível deletar a foto: ${error.message}` });
    }
};

module.exports = {
    listPhotos,
    createPhoto,
    updatePhoto,
    deletePhoto
};