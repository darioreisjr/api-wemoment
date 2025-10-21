const supabase = require('../config/supabase');

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

module.exports = authenticateToken;