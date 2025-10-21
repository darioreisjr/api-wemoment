require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Pega a URL e a Chave do Supabase do arquivo .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Cria e exporta o cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;