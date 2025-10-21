const supabase = require('../config/supabase');

const listWishes = async (req, res) => {
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
};

const createWish = async (req, res) => {
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
        return res.status(500).json({ error: `Não foi possível criar o desejo: ${error.message}` });
    }

    res.status(201).json(data);
};

const updateWish = async (req, res) => {
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
};

const deleteWish = async (req, res) => {
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
};

module.exports = {
    listWishes,
    createWish,
    updateWish,
    deleteWish
};