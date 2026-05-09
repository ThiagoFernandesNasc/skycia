# Checklist da apresentação final

## Mapeamento da rubrica

| Critério | Evidência no projeto | Status |
|---|---|---|
| App em produção | Frontend React/Vite, backend Express, Swagger em `/docs`, endpoint `/voos/live`, build validado com `npm --prefix frontend run build` | Atenção: precisa URL pública no dia |
| Arquitetura | 3 camadas em `docs/ARCHITECTURE.md`: Frontend, Backend/API, MySQL/MariaDB | OK |
| Dados e ETL | `operacional.sql` com SOR/SOT operacional e `spec.sql` com SPEC/LGPD; validação em `npm test` no backend | OK; falar que a validação é script Node equivalente, não dbt/pytest literal |
| IA tradicional + generativa | Score de risco em `/ia/risco-atraso/:numero_voo`; chat em `/ia/chat`; LLM via Gemini/OpenAI com fallback local | OK; chamar a acurácia de fixture controlada |
| LGPD | Consentimento, auditoria, sessões e solicitações de exportação/exclusão em `spec.sql` e tela de Configurações | OK; mostrar consentimento, modo privacidade/anonimização e solicitação de exclusão |
| Apresentação | Roteiro sugerido de 15 minutos abaixo | Preparar ensaio |

## Pontos para falar

- Dataset: dados operacionais de voos do banco `sistema_voos`, enriquecidos por fontes ao vivo OpenSky/AeroDataBox quando disponíveis, com fallback local.
- Tamanho: durante a demo, mostrar a quantidade retornada pelo dashboard ou pelo JSON de `/voos/live`; não usar `GET /voos` para isso, porque ele mostra só os registros seedados.
- SOR/SOT/SPEC: explicar `sistema_voos` como operacional/SOR+SOT e `sistema_voos_spec` como SPEC focada em usuário, consentimento e LGPD.
- IA tradicional: explicar que o score usa status, janela de horário, rastreio, completude e fonte do dado.
- IA generativa: explicar que o LLM gera respostas/explicações a partir de contexto fornecido, sem inventar voos.
- Mitigação de alucinação: prompt limita a resposta ao contexto, há fallback por regras, confiança exibida e instrução explícita para declarar falta de dados.
- LGPD: mostrar conceder/revogar consentimento e registrar solicitação de exportação ou exclusão.

## Roteiro de 15 minutos

1. 2 min: grupo e papéis.
2. 2 min: dataset, origem, tamanho e problema.
3. 3 min: arquitetura em 3 camadas.
4. 5 min: demo ao vivo com URL pública.
5. 2 min: resultados de IA, exemplo generativo e validação `npm test`.
6. 1 min: dificuldades e aprendizados.

## Comandos de validação

```bash
npm --prefix frontend run build
npm --prefix projetoti test
node projetoti/src/server.js
```

## Pendência crítica

A rubrica exige URL pública e não aceita vídeo gravado. O projeto foi ajustado para servir o build do frontend pelo backend Express, então uma única URL pública na porta `3000` abre o app, Swagger e API.

Passo recomendado no dia:

```bash
npm --prefix frontend run build
npm --prefix projetoti start
ssh -T -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:3000 nokey@localhost.run
```

Use a URL HTTPS impressa pelo SSH:

- App: `URL_PUBLICA/`
- Swagger: `URL_PUBLICA/docs`
- API ao vivo: `URL_PUBLICA/voos/live`

Alternativa:

```bash
npx --yes localtunnel --port 3000
```

Teste a URL pública em outra rede, de preferência pelo celular no 4G/5G, antes de entrar na sala.
