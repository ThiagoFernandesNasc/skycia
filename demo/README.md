# Demo mode (apresentacao)

Este modo deixa o sistema mostrando apenas o Dashboard e a API de voos ao vivo.

## Backend (API)
1. Copie o arquivo de exemplo:
   - `demo/.env.backend.example` -> `projetoti/.env` (ou ajuste o seu atual)
2. Garanta a variavel:
   - `DEMO_MODE=true`

## Frontend (Dashboard)
1. Copie o arquivo de exemplo:
   - `demo/.env.frontend.example` -> `frontend/.env`
2. Garanta a variavel:
   - `VITE_DEMO_MODE=true`

## Rodar
- Backend: `cd projetoti && npm run dev`
- Frontend: `cd frontend && npm run dev`

## Teste rapido
1. Abra `http://localhost:3000/docs` e confirme que só existe `/voos/live`.
2. Abra `http://localhost:5173` e confirme que só aparece a aba Dashboard.
3. Acesse `http://localhost:3000/voos/live` e verifique o JSON retornado.

## Voltar ao normal
1. No backend: remova `DEMO_MODE=true` ou troque para `DEMO_MODE=false` em `projetoti/.env`.
2. No frontend: remova `VITE_DEMO_MODE=true` ou troque para `VITE_DEMO_MODE=false` em `frontend/.env`.
3. Reinicie o back e o front.

## O que fica ativo
- Dashboard (somente)
- Endpoint publico: `GET /voos/live`
- Swagger: `/docs` e `/docs.json` 