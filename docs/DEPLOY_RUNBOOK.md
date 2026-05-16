# Runbook de Deploy

## 1) Pré-requisitos locais
- Node.js LTS
- npm
- MySQL/MariaDB

## 2) Rodar localmente
1. Execute `projetoti/operacional.sql`.
2. Execute `projetoti/spec.sql`.
3. Ou rode:

```bash
npm --prefix projetoti run init:db
```

## 3) Variáveis de ambiente
1. Copie `projetoti/.env.example` para `projetoti/.env`.
2. Configure:
- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `JWT_SECRET`
- `PORT` (opcional)
- `LLM_PROVIDER` (`openai` ou `gemini`)
- `OPENAI_API_KEY` e `OPENAI_MODEL` (se usar OpenAI)
- Modelo recomendado para a apresentação: `OPENAI_MODEL=gpt-4o-mini`
- `GEMINI_API_KEY` e `GEMINI_MODEL` (se usar Gemini)
- Teste rapido da chave: `cd projetoti && npm run check:gemini`

## 4) Instalar dependências
- Backend: `cd projetoti && npm install`
- Frontend: `cd frontend && npm install`

## 5) Executar
- Script rapido no Windows: `start-all.bat`
- Ou manual:
- `cd projetoti && npm run dev`
- `cd frontend && npm run dev`

## 6) Build de produção

Na raiz do repositório:

```bash
npm run build
npm start
```

O comando `npm run build` instala dependências do backend e frontend e gera `frontend/dist`.
O comando `npm start` sobe o Express, que serve frontend, API e Swagger na mesma URL.
Para inicializar os bancos manualmente, rode `npm run init:db`.

## 7) Deploy recomendado: Railway

Motivo: o projeto precisa de Node.js e MySQL. O Railway permite criar um serviço web e um serviço MySQL no mesmo projeto.

1. Suba o código para o GitHub.
2. No Railway, crie um novo projeto a partir do repositório.
3. Adicione um serviço MySQL ao projeto.
4. No serviço web, configure as variáveis:

```env
JWT_SECRET=troque_por_um_valor_forte
LLM_PROVIDER=openai
OPENAI_API_KEY=sua_chave_openai
OPENAI_MODEL=gpt-4o-mini
DEMO_MODE=false
LIVE_FLIGHTS_CACHE_TTL=40
LIVE_AERODATABOX_DELAY_MS=1200
```

O código também aceita as variáveis automáticas comuns do MySQL em cloud:

```env
MYSQLHOST
MYSQLPORT
MYSQLUSER
MYSQLPASSWORD
```

Se a plataforma não injetar esses nomes, use:

```env
DB_HOST
DB_PORT
DB_USER
DB_PASS
```

5. O Railway deve usar os comandos de `railway.json`:

```bash
npm run build
npm start
```

6. Depois que o serviço MySQL estiver criado e as variáveis estiverem disponíveis no serviço web, rode o inicializador do banco uma vez:

```bash
npm run init:db
```

No Railway isso pode ser feito abrindo um shell/one-off command no serviço web, ou temporariamente alterando o start command para `npm run init:db && npm start`, aguardando passar, e depois voltando para `npm start`.

7. Após o deploy, teste:

```text
https://URL_PUBLICA/
https://URL_PUBLICA/docs
https://URL_PUBLICA/voos/live
```

## 8) Build de validação
- Frontend/backend juntos: `npm run build`
- Qualidade de dados/IA: `npm test`
- Backend (checagem sintática):
- `node --check projetoti/src/routes/auth.routes.js`
- `node --check projetoti/src/routes/ia.routes.js`

## 9) Troubleshooting rápido
- Erro 401 no login: validar senha hash e banco `sistema_voos_spec`.
- Erro de import no frontend: rodar `npm install` em `frontend`.
- Falha de CORS/token: validar `Authorization Bearer` enviado pelo `src/api.js`.
- IA generativa sem resposta: validar `LLM_PROVIDER`, a chave do provedor configurado e logs da rota `/ia/chat`.
- Erro de banco no deploy: confirmar se MySQL está no mesmo projeto e se `MYSQLHOST/MYSQLUSER/MYSQLPASSWORD` ou `DB_HOST/DB_USER/DB_PASS` existem.
- URL pública abre API mas não frontend: confirmar se `npm run build` gerou `frontend/dist`.

## 10) Swagger / OpenAPI
- UI: `http://localhost:3000/docs`
- JSON: `http://localhost:3000/docs.json`
