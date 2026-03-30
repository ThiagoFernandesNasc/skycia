# Apresentacao I

Este README serve como roteiro para a primeira apresentacao do projeto. A entrega prevista para a semana 5 e mostrar com clareza o que ja foi construido, como o grupo se organizou e qual sera a evolucao nas proximas etapas.

## Objetivo da apresentacao

Como ate o momento voces ja mostraram o Dashboard funcionando e a API, a apresentacao pode focar em 3 pontos:

1. Qual problema o projeto resolve.
2. O que ja esta implementado e funcionando hoje.
3. Como o time esta dividido para garantir a continuidade da entrega.

## Estrutura sugerida da fala

Tempo total recomendado: 8 a 12 minutos.

1. Abertura e contexto do problema.
2. Visao do produto.
3. Demonstracao do que ja funciona.
4. Explicacao tecnica da arquitetura.
5. Divisao de papeis no grupo.
6. Proximos passos ate a apresentacao final.

## Divisao por funcao

Equipe sugerida para a apresentacao:

- 1 Product Manager
- 1 Tech Lead
- 3 Devs

### Product Manager

Responsavel por abrir a apresentacao e conduzir a narrativa do produto.

O que falar:
- Apresentar o nome do projeto e o problema que ele resolve.
- Explicar o publico-alvo e o valor da solucao.
- Mostrar o escopo da entrega atual: dashboard e API.
- Explicar por que a equipe decidiu evoluir o projeto em etapas.
- Fechar com backlog e proximos marcos.

Exemplo de fala:
> Boa tarde. Nesta primeira entrega, nosso objetivo foi validar a fundacao do projeto SkyTrak CIA. A proposta da solucao e centralizar informacoes operacionais de voos em uma plataforma que facilite visualizacao, acompanhamento e, futuramente, apoio a decisao. Neste momento, estamos apresentando duas entregas ja funcionais: o dashboard no frontend e a API no backend, que representam a base sobre a qual as proximas etapas serao desenvolvidas.
>
> Do ponto de vista de produto, a nossa preocupacao foi organizar uma entrega inicial que nao fosse apenas conceitual, mas que ja demonstrasse valor pratico. Por isso, priorizamos uma interface capaz de exibir informacoes relevantes e uma API estruturada para sustentar a evolucao do sistema. Ao longo da apresentacao, vamos mostrar o que ja foi implementado, como o grupo se organizou e quais sao os proximos passos previstos.

### Tech Lead

Responsavel por explicar a arquitetura, as decisoes tecnicas e como as partes se conectam.

O que falar:
- Explicar a arquitetura geral: frontend, backend e banco.
- Mostrar a stack utilizada: React + Vite no frontend, Node + Express no backend e MySQL/MariaDB no banco.
- Explicar o fluxo principal: frontend consome a API, a API consulta dados e responde ao dashboard.
- Destacar a organizacao do sistema para crescimento futuro.
- Comentar rapidamente sobre documentacao, rotas e separacao entre camadas.

Exemplo de fala:
> Em termos tecnicos, estruturamos o projeto em tres camadas principais. No frontend, utilizamos React com Vite para construir a interface e organizar a experiencia do usuario. No backend, utilizamos Node.js com Express para concentrar as rotas, as regras de negocio e a exposicao dos dados por API. Na persistencia, utilizamos MySQL/MariaDB, com separacao entre os dados operacionais e os dados relacionados a SPEC e usuario.
>
> Essa arquitetura foi pensada para garantir clareza na separacao de responsabilidades e permitir evolucao incremental. Em outras palavras, conseguimos desenvolver e validar a interface, a API e a base de dados sem acoplamento excessivo, o que facilita manutencao, testes e expansao futura do sistema.

### Devs

Responsaveis pela demonstracao pratica do que esta funcionando hoje. Como sao 3 devs, o ideal e dividir a demonstracao em blocos curtos e complementares.

O que mostrar:
- Dev 1: dashboard no frontend e estrutura visual da entrega atual.
- Dev 2: documentacao da API, rotas disponiveis e exemplo de consumo.
- Dev 3: integracao entre frontend e backend, reforcando que a entrega nao e apenas visual.

### Exemplo de fala do Dev 1

> Nesta etapa, vamos apresentar a parte visivel da aplicacao, que e o dashboard. A proposta dessa interface e concentrar as principais informacoes operacionais em um unico ambiente, facilitando a leitura e o acompanhamento. Mesmo sendo uma primeira entrega, a tela ja demonstra a organizacao visual do sistema e serve como base para a evolucao das proximas funcionalidades.
>
> O ponto importante aqui nao e apenas a interface em si, mas o fato de ela ja estar conectada a uma estrutura real de dados. Ou seja, nao se trata de um prototipo estatico, e sim de uma camada funcional preparada para integracao e crescimento.

### Exemplo de fala do Dev 2

> Complementando a demonstracao, vamos mostrar agora a API do sistema. Ela foi estruturada para disponibilizar os dados que alimentam a aplicacao e para sustentar a expansao futura do projeto. Aqui conseguimos visualizar a documentacao das rotas e executar chamadas que comprovam o funcionamento do backend.
>
> Nesta entrega, esse ponto e importante porque demonstra que o projeto ja possui uma base tecnica consistente. Nao estamos apresentando apenas uma interface, mas tambem uma camada de servicos organizada, capaz de responder a requisicoes e suportar a logica da aplicacao.

### Exemplo de fala do Dev 3

> Para fechar a demonstracao, o principal ponto e mostrar a integracao entre as partes. O dashboard apresentado anteriormente consome informacoes disponibilizadas pela API, o que evidencia que frontend e backend ja estao trabalhando de forma conectada. Essa validacao e essencial para a proposta do projeto, porque confirma que a fundacao tecnica esta pronta para receber novas funcionalidades.
>
> A partir dessa base integrada, o grupo consegue evoluir com mais seguranca nas proximas etapas, incluindo ampliacao do frontend, fortalecimento do backend, integracoes adicionais e futuras funcionalidades de inteligencia artificial.

## Roteiro pronto para apresentar

### 1. Abertura

> Boa tarde. Somos o grupo responsavel pelo projeto SkyTrak CIA, uma solucao voltada ao acompanhamento operacional de voos e a analise de risco de atrasos. Nesta primeira apresentacao, nosso objetivo e demonstrar a base ja construida do sistema, destacando o dashboard funcional, a API em funcionamento e a forma como estruturamos o trabalho da equipe para garantir continuidade nas proximas entregas.

### 2. Problema e proposta de valor

> O problema que buscamos enfrentar e a dispersao de informacoes importantes para acompanhamento operacional e tomada de decisao no contexto de voos. A nossa proposta e consolidar esses dados em uma unica plataforma, oferecendo visibilidade, organizacao e uma base preparada para futuras evolucoes, como analise preditiva, apoio inteligente e ampliacao dos modulos operacionais.

### 3. O que ja foi entregue

> Nesta etapa inicial, priorizamos a entrega de duas frentes essenciais: o dashboard no frontend, responsavel pela visualizacao das informacoes, e a API no backend, responsavel por disponibilizar e estruturar os dados consumidos pelo sistema. Com isso, conseguimos validar nao apenas a ideia do projeto, mas uma implementacao real e integrada.

### 4. Explicacao tecnica

> No frontend, utilizamos React com Vite para desenvolver a interface da aplicacao. No backend, utilizamos Node.js com Express para estruturar as rotas e a logica de negocio. Para persistencia e organizacao dos dados, utilizamos MySQL/MariaDB. Essa separacao arquitetural foi adotada para garantir manutencao mais simples, melhor organizacao do codigo e maior capacidade de evolucao ao longo do semestre.

### 5. Demonstracao

Sugestao de ordem:

1. Abrir o dashboard e mostrar a interface.
2. Explicar rapidamente o que cada bloco principal representa.
3. Abrir a documentacao da API em `http://localhost:3000/docs`.
4. Executar ou mostrar uma rota como `GET /voos/live`.
5. Relacionar a resposta da API com o que aparece no frontend.

Frase de transicao:
> Depois desse contexto, vamos apresentar de forma objetiva o que ja esta funcionando na pratica dentro do projeto.

### 6. Divisao do grupo

> Para organizar o desenvolvimento de maneira eficiente, dividimos o grupo em cinco integrantes, com papeis bem definidos. O Product Manager ficou responsavel pelo alinhamento da proposta, pela visao do produto e pelo planejamento das entregas. O Tech Lead conduziu as decisoes arquiteturais e a integracao tecnica entre as partes do sistema. Os tres Devs atuaram diretamente na implementacao, validacao e demonstracao pratica das funcionalidades desenvolvidas ate aqui.

### 7. Proximos passos

Como a trilha da disciplina segue com frontend 100%, backend, IA, refino da SPEC e testes, voces podem encerrar com algo assim:

> A partir da base que estamos apresentando hoje, os proximos passos do grupo incluem a evolucao completa do frontend, o fortalecimento do backend, a integracao dos modulos de inteligencia artificial, o refino da SPEC e a consolidacao dos testes. Em outras palavras, esta primeira entrega valida a fundacao do projeto, enquanto as proximas etapas serao voltadas para ampliar profundidade tecnica, robustez e valor funcional da solucao.

## Slide por pessoa

Se voces forem apresentar com slides, uma divisao simples para 5 integrantes pode ser:

1. Product Manager:
   Problema, objetivo, publico-alvo, escopo atual e roadmap.
2. Tech Lead:
   Arquitetura, tecnologias e fluxo entre frontend, backend e banco.
3. Dev 1:
   Dashboard, interface e valor da camada visual.
4. Dev 2:
   API, documentacao e exemplo de rota.
5. Dev 3:
   Integracao entre as camadas, situacao atual da entrega e transicao para proximos passos.

## Roteiro profissional por integrante

### Product Manager

> Boa tarde. Somos o grupo responsavel pelo SkyTrak CIA. O projeto foi pensado para centralizar informacoes operacionais de voos e criar uma base capaz de apoiar o acompanhamento e, futuramente, a analise de risco de atrasos. Nesta primeira entrega, nosso foco foi validar a estrutura do produto com uma implementacao funcional, priorizando um dashboard no frontend e uma API no backend.
>
> A decisao do grupo foi trabalhar em etapas, garantindo que cada entrega tivesse valor real e contribuicoes concretas para a evolucao do sistema. Assim, em vez de apresentar apenas uma proposta conceitual, optamos por demonstrar uma base ja operante, sobre a qual construiremos as proximas funcionalidades previstas no cronograma.

### Tech Lead

> Do ponto de vista tecnico, estruturamos o sistema em uma arquitetura separada por responsabilidades. O frontend foi desenvolvido com React e Vite, concentrando a interface e a experiencia de uso. O backend foi implementado com Node.js e Express, responsavel por expor as rotas e organizar a logica da aplicacao. Na camada de dados, utilizamos MySQL/MariaDB para sustentar a persistencia e a organizacao das informacoes.
>
> Essa organizacao nos permite evoluir o projeto com mais controle, reduzindo acoplamento e facilitando manutencao. A arquitetura que estamos apresentando hoje nao foi pensada apenas para esta entrega, mas para sustentar as proximas fases do projeto com mais consistencia.

### Dev 1

> Iniciando a demonstracao pratica, vamos mostrar o dashboard da aplicacao. Nesta etapa, a interface foi pensada para concentrar de forma clara as informacoes mais relevantes do sistema. O objetivo foi construir uma base visual organizada, que ja permita enxergar a proposta do produto em funcionamento.
>
> Mesmo sendo uma entrega inicial, o dashboard ja representa um ponto importante do projeto, porque transforma a camada tecnica em uma experiencia visivel e compreensivel para o usuario. Isso ajuda a validar nao apenas a implementacao, mas tambem a direcao do produto.

### Dev 2

> Na sequencia, vamos apresentar a API que sustenta essa camada visual. Ela foi organizada para disponibilizar os dados consumidos pela aplicacao e para servir como base de expansao do sistema. Aqui conseguimos observar a documentacao das rotas e executar uma chamada que comprova o funcionamento do backend.
>
> Esse momento da apresentacao e importante porque mostra que a entrega nao se limita ao frontend. Existe uma estrutura de servicos funcionando, com capacidade real de alimentar a aplicacao e de suportar as proximas funcionalidades planejadas pelo grupo.

### Dev 3

> Para concluir a demonstracao, o principal ponto e reforcar a integracao entre frontend e backend. O dashboard apresentado anteriormente depende da API para obter os dados exibidos, o que demonstra que as camadas do sistema ja estao conectadas e funcionando de forma coerente.
>
> Isso nos da seguranca para avancar para as proximas etapas do cronograma. Com a base integrada e validada, o grupo pode direcionar esforcos para ampliacao de funcionalidades, refinamento tecnico e incorporacao dos modulos previstos para as proximas entregas.

## O que evitar na apresentacao

- Nao gastar muito tempo explicando codigo linha por linha.
- Nao prometer funcionalidades que ainda nao existem como se ja estivessem prontas.
- Nao deixar a demo sem roteiro.
- Nao abrir muitas telas desnecessarias.
- Nao focar apenas em interface sem mostrar a API.

## Checklist antes de apresentar

- Frontend rodando.
- Backend rodando.
- Dashboard abrindo corretamente.
- Swagger ou endpoint pronto para demonstracao.
- Integrante sabe exatamente sua parte da fala.
- Ordem da apresentacao combinada.
- Uma pessoa preparada para assumir caso a demo falhe.

## Modo demo

Se quiserem apresentar somente Dashboard + API de voos ao vivo, usem o modo de demonstracao abaixo.

### Backend

1. Copie o arquivo de exemplo:
   - `demo/.env.backend.example` -> `projetoti/.env`
2. Garanta a variavel:
   - `DEMO_MODE=true`

### Frontend

1. Copie o arquivo de exemplo:
   - `demo/.env.frontend.example` -> `frontend/.env`
2. Garanta a variavel:
   - `VITE_DEMO_MODE=true`

### Rodar

- Backend: `cd projetoti && npm run dev`
- Frontend: `cd frontend && npm run dev`

### Teste rapido

1. Abra `http://localhost:3000/docs` e confirme que so existe `/voos/live`.
2. Abra `http://localhost:5173` e confirme que so aparece a aba Dashboard.
3. Acesse `http://localhost:3000/voos/live` e verifique o JSON retornado.

### Voltar ao normal

1. No backend: remova `DEMO_MODE=true` ou troque para `DEMO_MODE=false` em `projetoti/.env`.
2. No frontend: remova `VITE_DEMO_MODE=true` ou troque para `VITE_DEMO_MODE=false` em `frontend/.env`.
3. Reinicie o back e o front.

## Resumo para falar em 30 segundos

> Nesta primeira entrega, validamos a base do projeto com duas frentes ja funcionais: o dashboard no frontend e a API no backend. A equipe foi organizada com um Product Manager, um Tech Lead e tres Devs, garantindo divisao clara entre visao de produto, arquitetura tecnica e implementacao. Com isso, apresentamos nao apenas uma ideia, mas uma estrutura real de sistema pronta para evoluir nas proximas etapas.
