# Uso de IA

Este documento registra o uso real de IA como ferramenta de engenharia. Decisões de produto, escopo, arquitetura, validação e aceitação permanecem sob responsabilidade do candidato.

## Etapa de planejamento

Até a criação destes documentos, o trabalho foi de análise e documentação. Nenhuma aplicação, dependência, migration ou infraestrutura foi inicializada.

O desafio técnico oficial foi mantido como fonte de verdade durante todo o desenvolvimento. Ferramentas de IA foram utilizadas como apoio em planejamento, implementação, revisão e documentação, sempre com validação das decisões e do comportamento final da aplicação.

## Ferramentas e contribuições

### ChatGPT

Foi usado para discussão e revisão do briefing de planejamento, incluindo organização das perguntas, controle de escopo e pontos que exigiam análise crítica. Conforme informado pelo candidato, essa revisão utilizou um modelo OpenAI com raciocínio alto.

### Codex

Foi usado para:

- inspecionar o repositório e ler integralmente as fontes;
- separar requisitos oficiais, opcionais e decisões internas de entrega;
- analisar arquitetura, modelo de dados, concorrência de assentos, segurança do QR e consumo atômico;
- propor jornadas, API, testes, deploy, riscos, milestones e cortes de escopo;
- sintetizar o planejamento aprovado em `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DECISIONS.md` e este registro.

Nesta etapa, o Codex não implementou código nem instalou dependências.

## Decisões e revisão humanas

O candidato revisou o planejamento e aprovou explicitamente:

- foco exclusivo em cinema e uso da TMDb;
- deploy como P0 estratégico, embora opcional no enunciado;
- compartilhamento em `/shared/:token`, com token forte, hash no banco e `no-store`;
- hold de 10 minutos, expiração lazy e ordem de locks comum ao pagamento;
- QR HS256 com dados mínimos e confirmação do estado no banco;
- imutabilidade estrutural de sessões publicadas;
- teto aproximado de 20 horas e ordem dos primeiros cortes.

O candidato também autorizou a transformação do plano nestes quatro documentos e manteve proibidos implementação, instalação, commit e alterações em outros arquivos.

## Validações desta etapa

- releitura das instruções vigentes do repositório;
- revisão cruzada dos quatro documentos e das decisões aprovadas;
- inspeção do diff completo;
- verificação de whitespace com `git diff --check`;
- conferência final do working tree.

Na etapa de planejamento descrita acima ainda não havia testes, typecheck, lint, build ou smoke test da aplicação. Esses resultados passaram a existir no M0 e estão registrados a seguir.

## M0 — Fundação

Em 18 de agosto de 2026, o Codex auxiliou no scaffold e na configuração da fundação técnica aprovada. O trabalho ficou restrito a:

- monorepo com npm workspaces;
- frontend mínimo em React, TypeScript e Vite;
- backend mínimo em Fastify e TypeScript, com `GET /health`;
- PostgreSQL local no Docker Compose;
- Prisma configurado sem models de domínio;
- lint, typecheck, teste de integração do health check e builds;
- documentação local mínima.

As escolhas de stack, simplicidade arquitetural e limite de escopo vieram do planejamento aprovado. O Codex consultou documentação oficial e o registro npm para compatibilizar versões estáveis, com destaque para Prisma 7, seu arquivo `prisma.config.ts` e o adapter PostgreSQL.

Verificações executadas localmente:

- instalação e resolução das dependências com npm;
- validação do Compose e PostgreSQL 17 em estado `healthy`;
- consulta SQL de conectividade no container;
- `prisma validate`, `prisma generate` e conexão `SELECT 1` pelo Prisma Client;
- `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`;
- inicialização conjunta com `npm run dev` e respostas HTTP 200 do frontend e de `/health`;
- `git diff --check`.

Não houve validação visual humana nesta etapa. A automação do navegador integrado não iniciou por uma restrição interna de caminho confiável do ambiente; a página mínima foi verificada por build e resposta HTTP contendo a identificação do projeto.

## M1 — Autenticação, RBAC e usuários de demonstração

Em 18 de agosto de 2026, o Codex auxiliou na implementação do milestone aprovado de autenticação. O trabalho incluiu:

- model `User`, enum de papéis, migration e seed idempotente com quatro contas;
- hashing Argon2id, login JWT HS256 de oito horas e confirmação do usuário no PostgreSQL a cada requisição autenticada;
- guards reutilizáveis de RBAC, sem criar endpoints diagnósticos na aplicação;
- CORS restrito à origem configurada e respostas públicas sem `passwordHash`;
- frontend temporário de login, restauração por `/auth/me`, `sessionStorage` e área mínima por papel.

As decisões de stack e segurança vieram do planejamento aprovado. Durante a implementação, o Codex consultou as fontes oficiais dos plugins Fastify, Argon2 e seed do Prisma para confirmar compatibilidade e configuração. Uma revisão independente ajudou a identificar a necessidade de fixar HS256 na verificação, usar o papel atual do banco como autoridade do RBAC e não mascarar falhas do PostgreSQL como token inválido. Essa última correção recebeu teste de regressão. Rotas exclusivas de cada papel foram registradas somente nos testes, evitando poluir a API de produção.

Verificações executadas até esta atualização:

- Prisma formatado, validado e gerado;
- PostgreSQL local saudável e migration aplicada sem reset;
- seed executado duas vezes sem duplicar contas;
- lint e typecheck isolados da API;
- 19 testes automatizados passando, incluindo seed, login, JWT, `/auth/me`, RBAC, falha de banco e CORS;
- smoke HTTP de `/health`, login e `/auth/me` para as quatro contas de demonstração;
- builds da API e do frontend.

A validação visual automatizada continuou indisponível porque o navegador integrado recusou seu próprio caminho interno como não confiável. O frontend foi verificado por lint, typecheck, build e resposta HTTP, sem atribuir uma inspeção visual que não ocorreu.

A auditoria do npm também apontou o advisory [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), recém-publicado para `deepmerge-ts` transitivo do Prisma 7.9.1. O npm ofereceu somente downgrade incompatível do Prisma; não foram aplicados `--force` nem override sem suporte. A configuração Prisma deste projeto é estática e não recebe grafos de objetos de requisições, mas a dependência deve ser atualizada assim que houver versão estável compatível.

Não houve implementação de TMDb, sessões, assentos, reservas, pagamentos, ingressos ou qualquer item de M2. A revisão humana do M1 ainda não ocorreu.

## M2 — TMDb e gestão de sessões

Em 18 de agosto de 2026, o Codex auxiliou na implementação do fluxo do organizador aprovado para o M2. O trabalho incluiu:

- cliente TMDb isolado com `fetch` nativo, timeout, mapeamento mínimo e erros controlados;
- models `Session` e `Seat`, constraints do PostgreSQL e migrations sem entidades de milestones futuros;
- criação transacional de rascunho e assentos, edição restrita a `DRAFT`, ownership e publicação irreversível;
- frontend do organizador para catálogo, formulário, lista, edição e publicação, com atribuição oficial à TMDb;
- testes de integração com PostgreSQL real e fronteira externa simulada, sem chamar a TMDb nos testes.

As decisões vieram do planejamento aprovado: snapshot confiável obtido pelo backend, layout retangular de até 10 × 20 lugares e imutabilidade estrutural depois de `PUBLISHED`. Revisões independentes do Codex levaram a ajustes no timeout do corpo da resposta externa, limites do payload TMDb, isolamento dos testes locais, revalidação de horário antes da transação e comportamento do frontend quando o JWT expira. A checklist de boas práticas React orientou a separação dos componentes, efeitos abortáveis, estado derivado e acessibilidade básica, sem adicionar biblioteca.

Verificações executadas localmente:

- PostgreSQL 17 saudável, schema Prisma válido e três migrations aplicadas no total (duas do M2);
- Prisma Client gerado e conexão ao banco confirmada;
- lint, typecheck e builds da API e do frontend;
- 60 testes passando, incluindo RBAC, ownership, snapshot, rollback, publicação, falhas e timeout da TMDb;
- smoke HTTP do fluxo `login -> catálogo -> rascunho -> edição -> publicação`, usando catálogo falso somente na fronteira externa e removendo os dados criados ao final;
- frontend servido localmente com `GET /` respondendo 200;
- `git diff --check` e revisão de secrets ao término.

Não houve validação visual humana nesta etapa. O executável `agent-browser` não estava disponível no ambiente e a alternativa de navegador integrado não pôde carregar o Playwright; não foi instalada ferramenta adicional apenas para essa inspeção. A revisão humana do M2 ainda não ocorreu.

## M3 — Catálogo público e hold de assentos

Em 18 de agosto de 2026, o Codex auxiliou na implementação do catálogo de sessões publicadas, mapa acessível, fluxo do cliente e reserva temporária. A regra de concorrência seguiu o planejamento aprovado: preço e identidade vêm do backend, assentos são bloqueados em ordem determinística, o PostgreSQL fornece o relógio e `UNIQUE(ReservationSeat.seatId)` permanece como última defesa.

A expiração foi implementada de forma lazy, sem cron, fila ou cache. Revisões independentes levaram à captura de um único instante do banco para todo o mapa, à classificação correta dos conflitos no frontend e a ajustes de navegação e acessibilidade. O frontend permaneceu em React com estado local, sem gerenciador de estado ou dependências adicionais.

O PostgreSQL 17 permaneceu saudável, a migration foi aplicada e `npm run check` aprovou lint, typecheck, 81 testes e os dois builds. O teste concorrente foi repetido cinco vezes e sempre produziu um vencedor, um `409` e uma única alocação. Um smoke HTTP confirmou catálogo, detalhe, mapa, hold, ownership e conflito; sua fixture foi removida. A inspeção visual automatizada não ocorreu porque `agent-browser` não estava instalado e o runtime integrado não carregou Playwright. Não houve validação humana declarada nesta etapa.

## M4 — Pagamento simulado, ingresso e compartilhamento

Em 18 de agosto de 2026, o Codex auxiliou na implementação do pagamento síncrono aprovado, emissão atômica de ingressos, QR assinado e bearer link. A implementação preservou a ordem de locks definida no M3 e manteve preço, expiração, identidade e status sob autoridade do backend/PostgreSQL.

O trabalho incluiu `Payment`, `Ticket` e `SharedTicketLink`; cenários reproduzíveis `APPROVED`/`DECLINED`; código manual aleatório; JWS HS256 de payload mínimo e segredo separado; bilheteria do cliente; QR renderizado no frontend; e compartilhamento com 32 bytes aleatórios, somente SHA-256 persistido, rotação, revogação e respostas sem cache/PII. A única dependência nova foi `qrcode.react` 4.2.0, escolhida após consulta ao pacote e repositório oficiais por ser compatível com React 19 e não possuir dependências transitivas.

Revisões independentes do Codex levaram a quatro correções: colisão rara de código manual não é classificada como pagamento repetido; a tela limpa os assentos após recusa; a página compartilhada usa header sem identidade; e a troca de token reinicializa o componente. A configuração também rejeita reutilização do segredo de login como segredo do ingresso.

Verificações executadas localmente:

- PostgreSQL 17 saudável, cinco migrations aplicadas e Prisma validado/gerado;
- seed executado duas vezes, mantendo quatro contas, duas sessões e um ingresso demo;
- `npm run check` com lint, typecheck, 101 testes de integração e builds da API/web;
- teste concorrente com duas aprovações realmente aguardando o mesmo lock: um `200`, um `409`, um `Payment` e um ingresso por assento;
- trigger controlado no segundo ingresso comprovando rollback sem `Payment`, `PAID` ou ticket parcial;
- smoke HTTP de aprovação, recusa, listagem/detalhe, QR, mapa, rotação, revogação e página pública sem PII; fixtures removidas ao final;
- `git diff --check` e revisão de secrets/headers/logging no fechamento.

Não houve validação visual humana. O executável `agent-browser` não estava disponível e o navegador integrado recusou um módulo interno por política de caminho confiável; a interface foi verificada por lint, typecheck, build, respostas HTTP e revisão estática, sem atribuir inspeção visual inexistente.

## M5 — Portaria, câmera e consumo atômico

Em 18 de agosto de 2026, o Codex auxiliou na implementação da jornada operacional da portaria. O trabalho reutilizou o QR HS256 e o modelo `Ticket` do M4, sem criar entidade ou estratégia criptográfica nova. A API passou a listar sessões publicadas para `GATE`, resolver QR ou código manual e consumir com um único `UPDATE` condicional no PostgreSQL, preenchendo `usedAt` pelo relógio do banco e `usedByGateId` pela identidade autenticada.

A precedência `INVALID -> WRONG_EVENT -> ALREADY_USED -> VALID` foi explicitada para que a sessão escolhida seja a autoridade e para não revelar o uso de ingresso pertencente a outra sessão. O teste concorrente adotou a barreira PostgreSQL já usada nos milestones anteriores: duas requisições são comprovadamente bloqueadas na mesma linha antes da liberação, em vez de depender apenas do agendamento de `Promise.all`.

No frontend, a área temporária `GATE` foi substituída por seleção de sessão, scanner de câmera, entrada manual, quatro respostas inequívocas e reset operacional. `@zxing/browser@0.1.5` foi a única dependência direta adicionada; ela é carregada dinamicamente apenas na portaria, para decodificar QR sobre `getUserMedia`. O scanner interrompe a captura antes da chamada à API e trata permissão negada, ausência ou indisponibilidade de câmera mantendo o código manual acessível.

O seed foi ajustado para restaurar o ingresso demo para `VALID` ao ser executado novamente, preservando dados relativos e sem consultar a TMDb. A verificação final executou lint e typecheck dos dois workspaces, 111 testes, builds da API e do frontend, `git diff --check`, teste concorrente repetido com barreira real e smoke HTTP dos quatro resultados e da autorização. O navegador integrado não pôde ser inicializado por uma restrição de caminho confiável; portanto, não foi atribuída validação visual ou física da câmera, que ainda exige teste em dispositivo real servido por HTTPS ou em `localhost`.

## M6 — UX, robustez visual e redesign SEPTEM

Em 19 de agosto de 2026, o Codex auxiliou na auditoria e na refatoração visual do frontend, incluindo aplicação da identidade `SEPTEM`, reorganização das jornadas, estados de interface, responsividade e fallback para imagens indisponíveis. O apoio também incluiu a correção do pôster seedado de Interestelar e a atualização da documentação associada ao redesign.

A direção do produto não foi delegada à IA. O candidato executou e validou manualmente o fluxo ponta a ponta antes deste milestone, criticou a primeira versão por sua aparência editorial/genérica e por sua baixa densidade de informação, rejeitou essa direção e definiu marca, prioridades e critérios de aceitação. A decisão humana foi destacar programação, pôsteres, sessão, assentos, compra e ingresso, além de preservar no Gate uma linguagem operacional distinta.

Contratos e regras de negócio existentes permaneceram fora do escopo do redesign. No fechamento, foram executados lint, typecheck, os 111 testes existentes, builds de API/web, `git diff --check` e auditoria de arquivos de ambiente, secrets e chave TMDb no frontend. O script raiz de desenvolvimento iniciou web e API, confirmadas por respostas HTTP em `/` e `/health`.

Não houve inspeção renderizada automatizada: o navegador integrado recusou um módulo interno por sua política de caminho confiável. Os breakpoints de 375, 768 e 1280 px foram revisados estaticamente, sem atribuir uma validação visual que não ocorreu; a aceitação visual permanece com o candidato antes de qualquer commit.

### Revisão V2 da experiência consumer

Em 19 de agosto de 2026, a IA auxiliou a implementar a segunda revisão da Home, do header público, do topo da sessão e do mapa de assentos. O candidato avaliou manualmente tanto a primeira direção quanto o M6 v1 e rejeitou a Home do M6 v1 apesar de ela estar tecnicamente correta e visualmente mais consistente. A pesquisa de referências, a crítica ao modelo baseado em cards de sessão e a direção `local → data → filme → horário → assento` foram decisões humanas.

A implementação reaproveitou os dados e componentes existentes, sem biblioteca visual, componente externo, contrato novo ou mudança de backend. A V2 será validada visualmente pelo candidato antes de ser aceita; não houve Figma nem participação de designer profissional declarada.

### Revisão V3 da linguagem visual consumer

Em 19 de agosto de 2026, a IA implementou a V3 sob direção do candidato. O candidato já havia rejeitado o M6 v1 e, mesmo após a melhora funcional da V2, rejeitou também sua linguagem visual por ainda parecer próxima demais da primeira solução. A crítica ao excesso de preto, retângulos, bordas e baixa presença dos filmes, assim como a decisão de combinar stage cinematográfico, rail de pôsteres e programação marfim, foram humanas.

Referências externas de redes de cinema e galerias foram estudadas manualmente para extrair princípios de hierarquia e atmosfera; nenhuma interface ou componente foi copiado. A implementação permaneceu em React e CSS existentes, sem dependência nova. A aceitação visual final continua sendo responsabilidade do candidato após revisão manual; não houve Figma nem trabalho de designer profissional declarado.

## M7 — Swagger / OpenAPI

Em 19 de agosto de 2026, o Codex auxiliou no inventário das rotas e na implementação da documentação OpenAPI da API SEPTEM. O trabalho adicionou os plugins oficiais do Fastify, documentou as 23 operações reais e seus DTOs públicos, configurou autenticação bearer na Swagger UI e criou testes direcionados para inventário, segurança e resultados do Gate.

A decisão de executar apenas o bloco Swagger/OpenAPI, preservar Zod como autoridade de validação em runtime e não iniciar CI ou deploy permaneceu sob direção do candidato. Os schemas documentais foram conectados por transformação exclusiva do Swagger para evitar mudanças acidentais nos contratos, nas mensagens de erro ou na serialização dos handlers existentes. A aceitação final continua sendo responsabilidade do candidato após revisar o diff e a experiência em `/docs`.

## M7 — GitHub Actions / CI

Em 19 de agosto de 2026, o Codex auxiliou na auditoria dos scripts, variáveis de ambiente e dependências reais da suíte e na implementação da CI do SEPTEM. O workflow usa somente actions oficiais, Node.js 22 e PostgreSQL 17 real, gera o Prisma Client, aplica as migrations em banco vazio e torna lint, typecheck, testes e build gates obrigatórios. A auditoria identificou que as contas demo são fixtures exigidas pelos testes; por isso o seed idempotente roda depois das migrations e sem consultar a TMDb.

O candidato manteve o escopo restrito à CI e proibiu deploy, serviços adicionais, mudanças funcionais, commit e push. A revisão confirmou a sintaxe e a estrutura do YAML, permissão somente de leitura, valores artificiais, ausência de token TMDb e compatibilidade com Linux. Localmente, lint e typecheck passaram nos dois workspaces, os 114 testes passaram e os builds da API e do frontend concluíram; permaneceu apenas o warning já conhecido de chunk do frontend acima de 500 kB.

## M7 — Preparação de deploy

Em 19 de agosto de 2026, o Codex auxiliou na auditoria técnica e na preparação mínima do repositório para Vercel e Railway, sem realizar deploy ou criar recursos externos. O trabalho adaptou a porta da API à variável fornecida pela plataforma, adicionou encerramento controlado do Fastify, registrou build, migrations, start e healthcheck do Railway e incluiu somente o rewrite necessário para as rotas da SPA na Vercel.

As decisões preservaram CORS por origem explícita, secrets apenas no backend, migrations automáticas com `prisma migrate deploy` e seed demonstrativo como operação única após o primeiro deploy. A validação local aprovou os arquivos de configuração, lint, typecheck, 114 testes e os builds da API e do frontend. Um smoke em modo produção confirmou a precedência de `PORT`, `/health`, `/docs` e `/docs/json`; outro build confirmou a injeção de uma `VITE_API_URL` pública fictícia sem nomes de variáveis privadas no bundle. Permaneceu apenas o warning conhecido de chunk acima de 500 kB.

## M7 — Polimento final de produto e UX

Em 19 de agosto de 2026, o candidato definiu uma passada V3.5 sobre a direção SEPTEM já aprovada, com prioridade para acabamento perceptível, mobile, acessibilidade e visibilidade das regras fortes do produto. O 21st.dev foi usado como referência visual, e o ChatGPT auxiliou na curadoria e avaliação dessas referências. O Codex leu o repositório e o desafio versionado, auditou os fluxos e auxiliou na implementação e revisão.

Não houve copy/paste cego dos componentes estudados. O componente externo de ingresso oferecia boas ideias de boarding pass, notches, perfuração e hierarquia, mas sua camada de WebGL e dithering foi rejeitada por aumentar runtime, bundle e complexidade sem melhorar a leitura do QR. O sign-in externo dependia de Next.js, Three, Framer Motion e Tailwind CSS; essa composição também foi rejeitada por contrariar a stack e o nível de complexidade intencional do projeto. Os princípios aproveitados foram reimplementados com React, SVG e CSS próprios.

A implementação assistida incluiu marca SVG e metadata, estados globais de feedback e offline, preservação do contexto da programação, filtro derivado de cinemas reais, polling abortável de assentos, booking mobile, refinamento do timer sob autoridade do backend, compartilhamento por Web Share com fallback, melhorias de login, Organizer e Gate e uma passada de acessibilidade e responsividade. Nenhuma dependência foi adicionada; naquela primeira iteração, contratos, schema, regras de negócio, infraestrutura e deploy permaneceram fora do escopo.

Essa seleção é coerente com a vaga júnior porque privilegia APIs do navegador, componentes pequenos e comportamento explicável sobre uma troca de stack ou uma coleção de efeitos. Escopo, direção visual, itens proibidos e aceitação final permaneceram sob responsabilidade do candidato. A automação do navegador integrado não iniciou por uma restrição interna de caminho confiável; por isso, a revisão no ambiente do Codex foi estática e nenhuma inspeção renderizada foi atribuída como realizada. A revisão visual final continua sendo humana antes de commit ou publicação.

A validação daquela iteração aprovou lint e typecheck nos dois workspaces, os 114 testes então existentes, builds da API e do frontend, `npm ls --depth=0` e `git diff --check`, sem dependência ou secret novo. Um smoke HTTP do build local confirmou a entrega da Home, login, favicon e deep links de sessão, reserva, ingressos, compartilhamento e Gate; ele não substitui a inspeção visual nem o teste físico de câmera/QR.

### Passada final após revisão humana

Em 19 de agosto de 2026, o candidato realizou nova revisão visual da aplicação publicada e aprovou a direção da marca, login, mapa, Organizer e Gate, mas rejeitou o acabamento ainda conservador da Home, o recorte inconsistente de alguns pôsteres e a altura do ingresso. Esse feedback humano definiu as prioridades da última passada; a IA não decidiu sozinha que o produto precisava de outro redesign.

O desafio oficial permaneceu como fonte primária. O ChatGPT apoiou a pesquisa e a curadoria de referências: a Ingresso.com ajudou a confirmar horário como ação central do fluxo de cinema; a Sympla serviu como referência de operação móvel da portaria; projetos públicos de Patrick Pierre e Kauã Miguel foram tratados apenas como benchmarks históricos de apresentação, pois pertencem a enunciados possivelmente diferentes; e o 21st.dev continuou sendo inspiração de princípios visuais. Nenhuma empresa ou candidato endossou a SEPTEM, e nenhum markup, CSS, asset, arquitetura ou texto dessas fontes foi copiado.

O Codex auxiliou na auditoria e implementação. A Home passou a usar campos já persistidos para backdrop, duração e agrupamento por TMDb, ganhou horários reais no stage, rail navegável e contexto reproduzível na URL. O seed recebeu um cenário mais denso e idempotente sem consultar a TMDb. Web Share, Clipboard, Blob/iCalendar e impressão do navegador foram escolhidos para compartilhar sessão, adicionar à agenda e salvar o ingresso sem biblioteca. O trabalho também corrigiu a proporção dos pôsteres e refinou Organizer e Gate sem alterar suas regras.

Foram descartados conscientemente WebGL, shaders, Framer Motion, biblioteca de carrossel, PDF por dependência, fetch da TMDb no frontend, WebSocket/SSE, trailer, favoritos e dados promocionais inventados. Cancelamento de compra paga também foi rejeitado após auditoria: devolver o assento preservando ticket e histórico exigiria remodelar a alocação, adicionar estados e testar novas corridas com a portaria, colocando em risco garantias já estabilizadas.

A implementação permaneceu no working tree para revisão humana, sem commit, push, deploy ou acesso à produção. A validação renderizada automatizada continuou indisponível porque o navegador integrado recusou seu próprio módulo por política de caminho confiável; portanto, nenhuma inspeção visual automatizada foi atribuída como realizada.

Na validação técnica desta passada, `prisma generate`, lint, typecheck e os builds dos dois workspaces concluíram; 116 testes passaram e `npm ls --depth=0` confirmou o mesmo conjunto de dependências. O seed foi executado duas vezes somente no PostgreSQL local e preservou o cenário determinístico. Um smoke HTTP local confirmou health, OpenAPI, os três papéis de login, as oito sessões publicadas definidas pelo seed e o fallback da SPA em deep links. A câmera, o QR em dispositivo físico e a composição visual renderizada continuam reservados à revisão humana.

## Registro futuro

Após cada milestone, adicionar fatos concluídos, sem atribuir trabalho de IA como manual:

| Data | Ferramenta | Finalidade | Resultado aproveitado | Decisão/revisão humana | Verificação |
|---|---|---|---|---|---|
| `AAAA-MM-DD` | ChatGPT/Codex | descrição objetiva | arquivo ou decisão | aceito, alterado ou rejeitado | comandos e resultados |

Prompts ou especificações relevantes podem ser preservados quando ajudarem a explicar decisões. Conversas completas, dados pessoais, secrets e credenciais não devem ser publicados.