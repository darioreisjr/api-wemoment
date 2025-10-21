const supabase = require('../config/supabase');

const listEvents = async (req, res) => {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', req.user.id);

    if (error) {
        console.error('Erro ao buscar eventos:', error);
        return res.status(500).json({ error: 'Não foi possível buscar os eventos.' });
    }

    res.status(200).json(data);
};

const createEvent = async (req, res) => {
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
        .select()
        .single(); // Alterado para single() para retornar o objeto

    if (error) {
        console.error('Erro ao criar evento:', error);
        return res.status(500).json({ error: 'Não foi possível criar o evento.' });
    }

    res.status(201).json(data);
};

const updateEvent = async (req, res) => {
    const { id } = req.params;
    const { title, description, date, location, type } = req.body;

    const { data, error } = await supabase
        .from('events')
        .update({ title, description, date, location, type })
        .eq('id', id)
        .eq('user_id', req.user.id)
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
};

const deleteEvent = async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);

    if (error) {
        console.error('Erro ao deletar evento:', error);
        return res.status(500).json({ error: 'Não foi possível deletar o evento.' });
    }

    res.status(204).send(); // 204 No Content
};

module.exports = {
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent
};