# Roteiro da apresentação final

Tempo total: 15 minutos.

## Antes de começar

Abra tudo antes da fala:

- URL pública do app: `URL_PUBLICA/`
- Swagger: `URL_PUBLICA/docs`
- API ao vivo: `URL_PUBLICA/voos/live`
- Terminal com validação: `npm --prefix projetoti test`
- Deixe uma conta já cadastrada para mostrar LGPD e chat autenticado.
- Não use `GET /voos` para mostrar tamanho do dataset: essa rota lista só os 2 registros operacionais seedados. Para dados reais/ao vivo, use `GET /voos/live`.

No dia, gere a URL pública com:

```bash
demo\public-url.bat
ssh -T -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:3000 nokey@localhost.run
```

## 1. Grupo e papéis - 2 min

Tela sugerida: app aberto no Dashboard.

Fala:

> Somos o grupo responsável pelo SkyTrak ATC, uma aplicação para acompanhamento operacional de voos e apoio à decisão sobre risco de atrasos. Dividimos o trabalho em produto, arquitetura, frontend, backend, dados/IA e validação. A ideia foi entregar uma aplicação funcionando, com três camadas claras, dados reais quando disponíveis, IA tradicional e generativa, e uma camada de LGPD.

Mostre rapidamente:

- Nome do sistema no topo.
- Dashboard carregado.
- Menu lateral com as principais áreas.

## 2. Dataset - 2 min

Tela sugerida: `URL_PUBLICA/voos/live` ou Dashboard com mapa.

Fala:

> O dataset principal é de voos. Temos uma base operacional própria no banco `sistema_voos`, que funciona como SOR/SOT do projeto, e também uma camada ao vivo em `/voos/live`, integrada com OpenSky e AeroDataBox. Quando alguma API externa falha, o sistema usa fallback local para manter a demo estável. O problema resolvido é centralizar status, rota, companhia, aeronave, portão e risco de atraso em uma única visão operacional.

Mostre:

- Endpoint `/voos/live`.
- Campo `items` no JSON e a quantidade de itens retornados.
- No app, mostre o mapa/lista de voos.
- Se alguém perguntar por que `GET /voos` tem poucos itens, responda: "`GET /voos` é a rota da tabela operacional seedada; a rota de dataset ao vivo usada na demo é `/voos/live`."

Ponto para a rubrica:

> Isso comprova dados reais/fonte ao vivo e fallback controlado para produção acadêmica.

## 3. Arquitetura - 3 min

Tela sugerida: Swagger e, se tiver slide, diagrama das 3 camadas.

Fala:

> A arquitetura está separada em três camadas. O frontend usa React com Vite e entrega dashboard, mapa, voos, aeronaves, chat IA e configurações LGPD. O backend usa Node.js com Express, expondo rotas REST, autenticação, IA, integração com APIs externas e documentação Swagger. O banco usa MySQL/MariaDB com separação entre `sistema_voos`, para dados operacionais, e `sistema_voos_spec`, para usuário, segurança, consentimento e LGPD.

Fala sobre dados/ETL:

> Na camada de dados, separamos SOR/SOT/SPEC. O `sistema_voos` concentra a operação de voos e persistência de snapshots ao vivo. O `sistema_voos_spec` concentra usuário, consentimento, sessões, auditoria e solicitações LGPD. A validação de qualidade não foi feita com dbt/pytest, porque a stack do projeto é Node; implementamos um script equivalente em `npm test`, validando presença das tabelas essenciais e fixtures de IA.

Mostre:

- `URL_PUBLICA/docs`
- Rotas `/voos/live`
- Rotas `/ia/risco-atraso/{numero_voo}` e `/ia/chat`
- Rotas de autenticação/LGPD

Ponto para a rubrica:

> Frontend, backend e banco estão separados, e cada camada tem responsabilidade clara.

## 4. Demo ao vivo - 5 min

Tela sugerida: app completo.

Sequência:

1. Dashboard e mapa
   - Mostre filtros por status.
   - Clique em um voo.
   - Mostre modal com rota, horário, portão, velocidade, altitude, status e chance de atraso.

2. IA tradicional
   - No modal do voo, mostre a chance de atraso.
   - Explique que o score usa status, horário, altitude, velocidade, fonte e completude dos dados.

3. Chat IA
   - Abra o assistente.
   - Pergunte primeiro: `quais voos estão atrasados?`
   - Mostre resposta com confiança/fonte.
   - Para tentar acionar LLM/generativa, pergunte: `faça um resumo geral com recomendação executiva para a operação`.
   - Se a fonte aparecer como `llm`, explique que a resposta veio do Gemini/OpenAI configurado. Se aparecer como `rules`, explique que o sistema caiu no fallback local para estabilidade da demo.

4. LGPD
   - Vá em Configurações.
   - Mostre Central LGPD.
   - Mostre consentimentos, revogação e solicitação de exportação/exclusão.
   - Fale: consentimento é mostrado pelos botões de conceder/revogar; anonimização aparece no modo privacidade e nos relatórios LGPD; direito ao esquecimento é demonstrado pela solicitação de exclusão.

5. Swagger/API
   - Volte rapidamente para `/docs`.
   - Mostre que as rotas existem e sustentam a interface.

Frase importante:

> A demo não é vídeo gravado. A aplicação está acessível por URL pública, com frontend, backend e API respondendo ao vivo.

## 5. Resultados e IA - 2 min

Tela sugerida: terminal com `npm --prefix projetoti test`.

Fala:

> Para a IA tradicional, criamos uma validação objetiva com casos de teste controlados, chamados fixtures. Esses casos representam cenários esperados de risco baixo, médio e crítico. Nos fixtures internos, o modelo acertou todos os casos testados. Isso valida a lógica do score de risco, mas não deve ser apresentado como uma acurácia estatística de produção com milhares de amostras. Para IA generativa, o chat usa contexto dos voos e instruções para não inventar números, aeroportos ou voos. Quando falta dado, o sistema deve declarar a limitação e sugerir próximo passo.

Fala sobre qualidade dos dados:

> O mesmo `npm test` também valida que os scripts SQL possuem as estruturas essenciais de SOR/SOT/SPEC. Isso cumpre o papel de teste de qualidade dentro da stack Node do projeto.

Mostre:

- Saída do teste:
  - `QA1001: esperado=CRITICO obtido=CRITICO score=98%`
  - `QA1002: esperado=MEDIO obtido=MEDIO score=45%`
  - `QA1003: esperado=BAIXO obtido=BAIXO score=5%`
  - `Acuracia fixture IA tradicional: 100.0% (3/3)`
  - `Validação de qualidade concluída com sucesso.`

Fale sobre essa tela:

> Aqui o teste mostra três cenários controlados: crítico, médio e baixo. O score calculado bateu com o resultado esperado nos três, então a validação interna ficou 3 de 3. Isso confirma que a lógica do nosso modelo de risco está funcionando nesses casos de teste. É 100% nos fixtures internos de validação, não uma acurácia estatística geral do modelo.

Mitigação de alucinação:

> A resposta generativa é limitada ao contexto enviado, usa baixa temperatura, fallback local por regras e exibe confiança/fonte. Isso reduz alucinação e deixa claro quando a resposta vem do LLM ou do fallback.

Frase para pergunta sobre LLM:

> O LLM está integrado, mas a aplicação não depende exclusivamente dele. Se o Gemini/OpenAI estiver indisponível, o fallback local mantém a demo funcionando e evita respostas inventadas.

## 6. Dificuldades e aprendizados - 1 min

Fala:

> As principais dificuldades foram integrar dados ao vivo sem depender 100% de APIs externas, manter uma demo pública estável e separar os dados operacionais dos dados pessoais exigidos pela LGPD. O aprendizado foi que uma aplicação de dados precisa de fallback, validação, documentação de API e cuidado com privacidade desde o início.

Fechamento:

> Com isso, entregamos uma aplicação em três camadas, com dados operacionais, validação de qualidade, IA tradicional e generativa, e fluxo LGPD demonstrável.

## Checklist rápido

- App abre pela URL pública.
- `/docs` abre.
- `/voos/live` retorna JSON.
- Dashboard carrega.
- Modal do voo abre.
- Chat IA responde.
- Configurações/LGPD aparecem.
- `npm --prefix projetoti test` passa.
- Não abrir `.env` durante a apresentação.

## Verificação final da rubrica

Use estas frases se o professor perguntar se cada item foi realmente implementado:

- App em produção: "A aplicação está servida por URL pública, não é vídeo gravado. A mesma URL abre frontend, Swagger e API."
- Dados reais: "Para dados ao vivo, usamos `/voos/live`. A rota `GET /voos` tem poucos registros porque representa a tabela operacional seedada."
- Arquitetura: "Temos três camadas: React/Vite no frontend, Node/Express no backend e MySQL/MariaDB nos bancos `sistema_voos` e `sistema_voos_spec`."
- SOR/SOT/SPEC: "O `sistema_voos` concentra a operação e snapshots de voo; o `sistema_voos_spec` concentra usuário, consentimento, auditoria, sessões e solicitações LGPD."
- Qualidade: "Como a stack é Node, a validação foi implementada em `npm test`, exercendo o papel de teste de qualidade pedido na rubrica."
- IA tradicional: "Nos fixtures internos de validação, o score acertou todos os cenários testados. Isso valida a lógica do risco, mas não é uma acurácia estatística geral de produção."
- IA generativa: "O chat pode usar Gemini/OpenAI quando configurado e tem fallback local com fonte/confiança exibidas para manter a demo estável."
- Mitigação de alucinação: "A resposta é limitada ao contexto dos voos, usa baixa temperatura no LLM, fallback por regras e instrução para declarar falta de dados."
- LGPD: "Mostramos consentimento, revogação, modo privacidade/anonimização e solicitação de exportação ou exclusão como direito do titular."
