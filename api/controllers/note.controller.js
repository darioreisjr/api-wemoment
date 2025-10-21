const supabase = require('../config/supabase');

const listNotes = async (req, res) => {
    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', req.user.id)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Erro ao buscar anotações:', error);
        return res.status(500).json({ error: 'Não foi possível buscar as anotações.' });
    }
    res.status(200).json(data);
};

const createNote = async (req, res) => {
    const { title, content } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'O título é obrigatório.' });
    }

    const { data, error } = await supabase
        .from('notes')
        .insert({ user_id: req.user.id, title, content })
        .select()
        .single();

    if (error) {
        console.error('Erro ao criar anotação:', error);
        return res.status(500).json({ error: 'Não foi possível criar a anotação.' });
    }
    res.status(201).json(data);
};

const updateNote = async (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;

    const { data, error } = await supabase
        .from('notes')
        .update({ title, content })
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .single();

    if (error) {
        console.error('Erro ao atualizar anotação:', error);
        return res.status(500).json({ error: 'Não foi possível atualizar a anotação.' });
    }
    if (!data) {
        return res.status(404).json({ error: 'Anotação não encontrada ou você não tem permissão.' });
    }
    res.status(200).json(data);
};

const deleteNote = async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);

    if (error) {
        console.error('Erro ao deletar anotação:', error);
        return res.status(500).json({ error: 'Não foi possível deletar a anotação.' });
    }
    res.status(204).send();
};

module.exports = {
    listNotes,
    createNote,
    updateNote,
    deleteNote
};