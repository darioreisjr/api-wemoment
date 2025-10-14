# API WeMoment

API RESTful construída com Express e Supabase para autenticação de usuários do projeto **WeMoment**. O serviço oferece endpoints para cadastro, login, recuperação de senha e consulta de perfil autenticado, além de uma configuração de CORS dinâmica para controlar o acesso a partir dos ambientes web do cliente.

## Índice
- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Configuração do ambiente](#configuração-do-ambiente)
- [Como executar](#como-executar)
- [Endpoints](#endpoints)
  - [/api](#get-api)
  - [/api/auth/signup](#post-apiauthsignup)
  - [/api/auth/login](#post-apiauthlogin)
  - [/api/profile](#get-apiprofile)
  - [/api/auth/forgot-password](#post-apiauthforgot-password)
- [Tratamento de erros](#tratamento-de-erros)
- [Deploy na Vercel](#deploy-na-vercel)
- [Scripts disponíveis](#scripts-disponíveis)
- [Licença](#licença)

## Tecnologias
- [Node.js](https://nodejs.org/) + [Express 5](https://expressjs.com/)
- [Supabase](https://supabase.com/) (autenticação e banco de dados)
- [cors](https://www.npmjs.com/package/cors) para gerenciamento de CORS
- [dotenv](https://www.npmjs.com/package/dotenv) para gerenciamento de variáveis de ambiente

## Arquitetura
O projeto segue uma estrutura simples voltada para deploy serverless na Vercel:
```
.
├── api
│   └── index.js       # Código principal da API Express
├── package.json
├── vercel.json        # Configuração de build e rotas para deploy na Vercel
└── README.md
```

O arquivo `api/index.js` exporta a aplicação Express configurada com CORS dinâmico, middleware de parsing JSON e integração com o cliente Supabase para todas as operações de autenticação.

## Pré-requisitos
- Node.js 18 LTS ou superior
- Conta Supabase com projeto configurado
- Token de serviço `anon` do Supabase com permissões de autenticação

## Configuração do ambiente
1. Copie o arquivo `.env.example` (caso exista) ou crie um novo arquivo `.env` na raiz do projeto.
2. Defina as variáveis necessárias:

```bash
SUPABASE_URL="https://<sua-instancia>.supabase.co"
SUPABASE_ANON_KEY="<sua-chave-anon>"
CLIENT_URL_DEV="http://localhost:3000"   # URL do frontend em desenvolvimento
CLIENT_URL_PROD="https://seu-dominio.com" # URL do frontend em produção
PORT=3000                                  # Opcional: porta local para desenvolvimento
```

> 💡 As URLs definidas em `CLIENT_URL_DEV` e `CLIENT_URL_PROD` serão utilizadas para validar origens permitidas via CORS.

## Como executar
```bash
# Instalar dependências
npm install

# Rodar em ambiente local
npm start
```

O servidor será iniciado em `http://localhost:3000` (ou na porta definida pela variável `PORT`). Para testar a API manualmente, você pode utilizar ferramentas como [Insomnia](https://insomnia.rest/) ou [Postman](https://www.postman.com/).

## Endpoints
Todos os endpoints retornam respostas em JSON.

### `GET /api`
Endpoint de saúde que confirma se a API está operacional.

**Resposta 200**
```json
"Olá! A API está no ar."
```

### `POST /api/auth/signup`
Cria um novo usuário no Supabase Auth.

**Corpo da requisição**
```json
{
  "email": "user@dominio.com",
  "password": "senhaSegura123"
}
```

**Respostas**
- `201 Created` – Usuário criado com sucesso, retorna dados do usuário.
- `400 Bad Request` – E-mail ou senha ausentes, ou erro retornado pelo Supabase.

### `POST /api/auth/login`
Realiza login utilizando Supabase Auth e retorna o token de sessão.

**Corpo da requisição**
```json
{
  "email": "user@dominio.com",
  "password": "senhaSegura123"
}
```

**Respostas**
- `200 OK` – Retorna `token`, `user` e `message`.
- `401 Unauthorized` – Credenciais inválidas.

### `GET /api/profile`
Endpoint protegido que retorna dados básicos do perfil autenticado.

**Cabeçalhos obrigatórios**
```
Authorization: Bearer <access_token>
```

**Respostas**
- `200 OK` – Retorna `id`, `email` e `created_at` do usuário autenticado.
- `401 Unauthorized` – Quando o token não é enviado.
- `403 Forbidden` – Token inválido ou expirado.

### `POST /api/auth/forgot-password`
Inicia o fluxo de redefinição de senha enviando e-mail via Supabase.

**Corpo da requisição**
```json
{
  "email": "user@dominio.com"
}
```

**Respostas**
- `200 OK` – Mensagem genérica informando que o e-mail foi enviado caso o usuário exista.
- `400 Bad Request` – Quando o e-mail não é informado.

## Tratamento de erros
- Erros de autenticação retornam mensagens claras em português, com códigos HTTP apropriados (`401`, `403`, `400`).
- Exceções na integração com o Supabase são repassadas ao cliente quando relevante (ex.: tentativa de cadastro com e-mail já existente).

## Deploy na Vercel
O arquivo [`vercel.json`](vercel.json) já está configurado para deploy serverless na Vercel:
- Build com o runtime `@vercel/node` apontando para `api/index.js`.
- Rotas redirecionando qualquer chamada iniciada por `/api/` para o handler principal.

Para publicar:
1. Faça login na Vercel e importe o repositório.
2. Configure as variáveis de ambiente no painel da Vercel (as mesmas do `.env`).
3. O deploy será criado automaticamente a cada push na branch configurada.

## Scripts disponíveis
- `npm start`: inicia o servidor Express localmente.

*(Nenhum script de testes está configurado atualmente.)*

## Licença
Este projeto está licenciado sob a licença [ISC](https://opensource.org/license/isc-license-txt/).
