# SkyTrak CIA

Projeto com back-end (Node/Express) e front-end (React/Vite) para analise de risco de atrasos.

## Requisitos
- Node.js + npm
- MySQL/MariaDB

## Instalador Node (Windows)
- Rode `install-node.bat` para instalar o Node.js LTS via winget.

## Configuracao
1. Crie os bancos e tabelas:
   - `projetoti/operacional.sql`
   - `projetoti/spec.sql`

2. Configure o `.env` do back-end:
   - Copie `projetoti/.env.example` para `projetoti/.env`
   - Ajuste credenciais e segredo JWT
   - Ajuste `CORS_ORIGIN` para o host do front (ex.: `http://localhost:5173`)
   - Nunca versione o `.env` (use o `.env.example`)
   - Se uma chave/senha vazar, gere outra e substitua

3. (Opcional) Configure o front-end:
   - Crie `frontend/.env` com `VITE_API_BASE_URL=http://localhost:3000`
   - O checkbox "Lembrar-me" no login estende a sessão para 7 dias

3. Instale dependencias:
   - `cd projetoti && npm install`
   - `cd frontend && npm install`

## Rodar
1. Tudo automatico (instala deps, valida MySQL, cria bancos se necessario e inicia):
   - `start-all.bat`

2. Setup somente (opcional):
   - `setup.bat`

3. Manual:
   - `cd projetoti && npm run dev`
   - `cd frontend && npm run dev`

## Observacoes
- O back-end usa dois bancos:
  - `sistema_voos` (operacional)
  - `sistema_voos_spec` (SPEC focada no usuario/LGPD)

## Dados ao vivo (nao comercial)
- O endpoint `GET /voos/live` integra OpenSky Network + AeroDataBox para demonstracao academica (sem uso comercial).
- Fallback automatico:
  - tenta OpenSky + AeroDataBox
  - se uma falhar, continua com a outra
  - se ambas falharem, usa fallback local do banco operacional
- Cache em memoria: `LIVE_FLIGHTS_CACHE_TTL` (20 a 40 segundos, padrao 30).
- Credenciais ficam apenas no back-end (`projetoti/.env`) e nao sao expostas no front-end.

## Documentacao completa
- [Arquitetura](./docs/ARCHITECTURE.md)
- [Frontend](./docs/FRONTEND.md)
- [Backend e API](./docs/BACKEND_API.md)
- [Banco de dados](./docs/DATABASE.md)
- [Runbook (execucao e deploy local)](./docs/DEPLOY_RUNBOOK.md)
