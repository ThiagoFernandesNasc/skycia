# Anotacoes Pos-Demo - 2026-04-02

Registro rapido das pendencias lembradas apos a apresentacao da demo.

## Acompanhamento das melhorias

### Ja feito / avancado
- Demo desativada por configuracao, sem remover a funcionalidade.
- Grafico de probabilidade ajustado para responder melhor ao voo selecionado.
- Dashboard melhor organizado para foco no voo escolhido.
- Tabela de voos com selecao e destaque visual do voo em foco.
- Painel lateral do voo selecionado ajustado para nao esconder a leitura principal da tela.
- Explicacao visual da probabilidade melhorada com sinais de risco e leitura mais organizada.
- Persistencia de dados ao vivo no banco implementada em tabelas de estado atual e historico.
- Endpoint para consultar voos persistidos adicionado.
- Consulta de detalhe do voo ajustada para enriquecer melhor o voo selecionado.
- Uso da AeroDataBox reduzido no mapa geral e priorizado no detalhe do voo selecionado.
- `start-all.bat` refinado para validar melhor a conexao com MySQL.
- Base `operacional.sql` revisada para ficar mais segura e reexecutavel.
- Base `spec.sql` revisada para ficar idempotente e sem erro de indice duplicado.
- Arquivo com `SELECT`s prontos criado para facilitar consulta no banco.
- Central LGPD visivel no front com finalidades, consentimento e revogacao.
- Endpoints de consentimento LGPD adicionados e registrados no banco `SPEC`.
- Auditoria de consentimentos LGPD registrada no `SPEC`.
- IA tradicional/preditiva formalizada para calcular atraso com status, horario, altitude, velocidade, completude de dados, fonte e historico.
- Endpoint de risco agora consulta tambem os voos ao vivo persistidos, nao apenas a tabela operacional.
- Painel do voo selecionado mostra explicacao e fatores da IA preditiva.

### Ainda falta / pendente principal
- Opcionalmente integrar IA generativa para explicar a previsao.
- Reduzir ainda mais campos `NULL` nos dados ao vivo persistidos.
- Amarrar ainda melhor a base `SPEC` ao fluxo de IA e relatorios.
- Iniciar testes completos do site.
- Validar fluxo completo: login, dashboard, mapa, selecao de voo, IA, LGPD, banco e relatorios.

## Prioridades lembradas

### 1. LGPD
- Adicionar a parte de LGPD no sistema.
- Revisar como isso sera refletido no fluxo do usuario e no banco/spec.

### 2. IA para probabilidade
- Adicionar a IA para calcular a probabilidade de atraso.
- Definir como a IA vai consumir os dados do voo e devolver a previsao.

### 3. Grafico de probabilidade de atraso
- Melhorar o visual do grafico de probabilidade de atraso.
- Organizar melhor a exibicao das informacoes.
- Mostrar especificamente os voos que o usuario selecionar.
- Exemplo esperado: ao selecionar um voo de Recife para Sao Paulo, exibir naquele momento a probabilidade de atraso desse voo.

### 4. Dados ao vivo no banco
- Mostrar no banco de dados todas as informacoes dos voos ao vivo no momento da execucao.
- Quando os voos mudarem, os dados tambem precisam refletir essas mudancas.
- No `SELECT`, exibir todas as informacoes disponiveis do voo.
- Exemplos citados: portao, altitude e demais dados ao vivo.

## Requisitos formais acrescentados depois

### 5. LGPD
- Implementar os requisitos de LGPD no sistema.
- Registrar consentimento do usuario.
- Deixar clara a finalidade de uso dos dados.
- Permitir revogacao e manter rastreabilidade no banco `SPEC`.

### 6. Banco de Dados SPEC
- Desenvolver a base `SPEC` com foco no usuario.
- Nao tratar a `SPEC` como banco operacional do back-end.
- Modelar dados voltados ao uso do sistema pelo usuario.
- Exemplos esperados: usuarios, consentimentos, sessoes, preferencias, auditoria e solicitacoes LGPD.

### 7. IA Tradicional / IA Generativa
- Implantar IA tradicional para previsao de atraso.
- Implantar IA generativa para explicacao do resultado ao usuario.
- Definir como a previsao sera calculada e como a explicacao sera apresentada.
- Idealmente combinar previsao + interpretacao no fluxo do voo selecionado.

## Observacoes
- Pode ser util transformar esta lista depois em backlog com ordem de execucao.

## Ponto de parada - 2026-04-13

### Estado confirmado
- Projeto executado com `start-all.bat`.
- LGPD testada e retornando dados corretamente.
- Consentimentos e solicitacoes LGPD gravando no banco `SPEC`.
- IA tradicional/preditiva implementada e funcionando no endpoint de risco.
- Painel do voo selecionado mostra chance de atraso, explicacao e fatores da IA.
- AeroDataBox voltou a responder com a nova chave, complementando parte dos dados operacionais.
- OpenSky segue sendo usado no mapa para rastreamento ao vivo e economia da AeroDataBox.
- Dados ao vivo persistem em `voo_live_estado` e `voo_live_snapshot`.
- `selects_prontos.sql` inclui view de apresentacao sem `NULL`.

### Proxima retomada recomendada
- Comecar testes completos do site de ponta a ponta.
- Testar login/cadastro/logout.
- Testar LGPD: conceder, revogar, solicitar exportacao e exclusao.
- Testar IA preditiva no voo selecionado.
- Testar IA generativa/Gemini, se a chave estiver valida.
- Testar dashboard, mapa, filtros, tabela, modal/painel do voo e relatorios.
- Conferir os dados no banco apos cada fluxo.

### Proximas melhorias depois dos testes
- Integrar ou fortalecer IA generativa com Gemini para explicar a previsao.
- Registrar historico de previsoes/consultas de IA no `SPEC` de forma mais especifica.
- Melhorar ainda mais o casamento entre OpenSky e AeroDataBox para reduzir campos ausentes.
- Criar roteiro final de demonstracao para apresentacao.

## Ajuste para proxima demo - 2026-04-15

- `DEMO_MODE=true` no backend passa a manter o backend completo ativo.
- Rotas `/auth`, `/ia` e `/voos` ficam disponiveis tambem em modo demo.
- `VITE_DEMO_MODE=true` no frontend nao bloqueia mais menu, login, configuracoes, relatorios, aeronaves ou voos.
- Em modo demo, a IA generativa/LLM fica desligada para evitar dependencia do Gemini na apresentacao.
- A IA tradicional/preditiva continua funcionando normalmente para probabilidade de atraso.
