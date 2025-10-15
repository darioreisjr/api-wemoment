# API WeMoment

API RESTful construída com Express e Supabase para autenticação de usuários do projeto **WeMoment**. O serviço oferece endpoints para cadastro, login, recuperação de senha e consulta de perfil autenticado, além de uma configuração de CORS dinâmica para controlar o acesso a partir dos ambientes web do cliente.

## Índice
- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Configuração do ambiente](#configuração-do-ambiente)
- [Como executar](#como-executar)
- [Fluxo de autenticação](#fluxo-de-autenticação)
- [Endpoints](#endpoints)
  - [/api](#get-api)
  - [/api/auth/signup](#post-apiauthsignup)
  - [/api/auth/login](#post-apiauthlogin)
  - [/api/profile](#get-apiprofile)
  - [/api/auth/forgot-password](#post-apiauthforgot-password)
- [Tratamento de erros](#tratamento-de-erros)
- [Deploy na Vercel](#deploy-na-vercel)
- [Scripts disponíveis](#scripts-disponíveis)
- [Próximos passos sugeridos](#próximos-passos-sugeridos)
- [Licença](#licença)

## Tecnologias
- [Node.js](https://nodejs.org/) + [Express 5](https://expressjs.com/)
- [Supabase](https://supabase.com/) (autenticação e banco de dados)
- [cors](https://www.npmjs.com/package/cors) para gerenciamento de CORS
- [dotenv](https://www.npmjs.com/package/dotenv) para gerenciamento de variáveis de ambiente

## Arquitetura
O projeto segue uma estrutura simples voltada para deploy serverless na Vercel:
```text
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

## Variáveis de ambiente
| Nome | Obrigatório | Descrição |
| ---- | ----------- | --------- |
| `SUPABASE_URL` | Sim | URL do seu projeto Supabase (ex.: `https://<sua-instancia>.supabase.co`). |
| `SUPABASE_ANON_KEY` | Sim | Chave pública (anon key) do Supabase utilizada para autenticação. |
| `CLIENT_URL_DEV` | Sim | Origem permitida para o frontend em desenvolvimento (utilizada pelo CORS). |
| `CLIENT_URL_PROD` | Sim | Origem permitida para o frontend em produção (também usada como base do link de redefinição de senha). |
| `PORT` | Não | Porta utilizada ao rodar a API localmente (padrão `3000`). |

> ⚠️ Caso qualquer uma das URLs (`CLIENT_URL_DEV` ou `CLIENT_URL_PROD`) não seja definida, as requisições web provenientes dessa origem serão bloqueadas pela validação de CORS.

## Configuração do ambiente
1. Crie um arquivo `.env` na raiz do projeto (ou copie de um `.env.example`, caso exista).
2. Defina as variáveis necessárias, seguindo o exemplo abaixo:

    ```bash
    SUPABASE_URL="https://<sua-instancia>.supabase.co"
    SUPABASE_ANON_KEY="<sua-chave-anon>"
    CLIENT_URL_DEV="http://localhost:3000"   # URL do frontend em desenvolvimento
    CLIENT_URL_PROD="https://app.wemoment.com" # URL do frontend em produção
    PORT=3000                                  # Opcional: porta local para desenvolvimento
    ```

3. No painel do Supabase, habilite o endereço listado em `CLIENT_URL_PROD` em **Authentication > URL Configuration > Redirect URLs**, adicionando também `https://<seu-domínio>/update-password` para suportar o fluxo de redefinição de senha.

## Como executar
```bash
# Instalar dependências
npm install

# Rodar em ambiente local
npm start
```

O servidor será iniciado em `http://localhost:3000` (ou na porta definida pela variável `PORT`). Para testar a API manualmente, utilize ferramentas como [Insomnia](https://insomnia.rest/) ou [Postman](https://www.postman.com/), lembrando de incluir o header `Origin` correspondente às URLs permitidas quando necessário.

## Fluxo de autenticação
1. **Cadastro (`/api/auth/signup`)**: cria o usuário no Supabase e envia e-mail de confirmação padrão.
2. **Login (`/api/auth/login`)**: retorna o token `access_token` (`token`) e o objeto `user` esperado pelo frontend.
3. **Perfil (`/api/profile`)**: requer o header `Authorization: Bearer <token>` para buscar os dados básicos do usuário autenticado via `supabase.auth.getUser`.
4. **Esqueci minha senha (`/api/auth/forgot-password`)**: dispara um e-mail de redefinição apontando para `CLIENT_URL_PROD/update-password`. Garanta que essa rota existe no frontend e esteja configurada como URL de redirecionamento no Supabase.

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
- `201 Created` – Usuário criado com sucesso.
  ```json
  {
    "user": {
      "id": "...",
      "email": "user@dominio.com",
      "created_at": "2024-01-01T00:00:00Z",
      "email_confirmed_at": null,
      "aud": "authenticated"
    },
    "message": "Usuário criado com sucesso! Verifique seu e-mail para confirmação."
  }
  ```
- `400 Bad Request` – E-mail ou senha ausentes, ou erro retornado pelo Supabase.
  ```json
  {
    "error": "Email e senha são obrigatórios."
  }
  ```

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
- `200 OK` – Retorna o token JWT do Supabase (`access_token`), o usuário autenticado e uma mensagem amigável.
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "...",
      "email": "user@dominio.com",
      "created_at": "2024-01-01T00:00:00Z"
    },
    "message": "Login realizado com sucesso!"
  }
  ```
- `400 Bad Request` – Faltam credenciais.
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
  ```json
  {
    "message": "Se um usuário com este e-mail existir, um link para redefinição de senha será enviado."
  }
  ```
- `400 Bad Request` – Quando o e-mail não é informado.

## Tratamento de erros
- Erros de autenticação retornam mensagens claras em português, com códigos HTTP apropriados (`401`, `403`, `400`).
- Exceções na integração com o Supabase são repassadas ao cliente quando relevante (ex.: tentativa de cadastro com e-mail já existente).
- Erros de CORS retornam `Acesso não permitido por CORS`. Revise suas origens configuradas caso receba esta mensagem.

## Deploy na Vercel
O arquivo [`vercel.json`](vercel.json) já está configurado para deploy serverless na Vercel:
- Build com o runtime `@vercel/node` apontando para `api/index.js`.
- Rotas redirecionando qualquer chamada iniciada por `/api/` para o handler principal.

Para publicar:
1. Faça login na Vercel e importe o repositório.
2. Configure as variáveis de ambiente no painel da Vercel (as mesmas do `.env`).
3. Garanta que as URLs do Supabase Auth estejam configuradas com os mesmos domínios do CORS.
4. O deploy será criado automaticamente a cada push na branch configurada.

## Scripts disponíveis
- `npm start`: inicia o servidor Express localmente.

*(Nenhum script de testes está configurado atualmente.)*

## Próximos passos sugeridos
- Adicionar testes automatizados (unitários e/ou integração) cobrindo os fluxos de autenticação.
- Incluir monitoramento de logs e métricas (ex.: Vercel Observability, Logflare) para acompanhar erros em produção.
- Implementar rate limiting ou proteção adicional em endpoints sensíveis (login e redefinição de senha).

## Licença
Este projeto está licenciado sob a licença [ISC](https://opensource.org/license/isc-license-txt/).
