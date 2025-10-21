// Configuração dinâmica do CORS
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

module.exports = corsOptions;