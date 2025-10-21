const multer = require('multer');

// Configuração do multer para armazenamento em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

module.exports = upload;