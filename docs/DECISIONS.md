# Decisões Técnicas

As decisões abaixo foram aprovadas para o MVP. Mudanças relevantes devem atualizar este registro antes da implementação.

## ADR-001 — Cinema e TMDb

### Contexto

O desafio admite domínios de eventos e integração com catálogo externo. O prazo favorece uma única jornada completa e coerente.

### Decisão

Implementar exclusivamente sessões de cinema. A TMDb será acessada pelo backend, e cada sessão guardará um snapshot do filme.

### Alternativas consideradas

Shows com Ticketmaster, suportar os dois domínios ou consultar a TMDb em toda exibição.

### Trade-offs

O foco reduz bifurcações e melhora a identidade do produto. Em contrapartida, dados operacionais de sessão, local, preço e assentos são responsabilidade da aplicação, e snapshots não acompanham correções posteriores da TMDb.

## ADR-002 — Monorepo e monólito modular

### Contexto

Frontend e backend precisam permanecer separados, mas o projeto deve ser simples de executar e avaliar.

### Decisão

Usar monorepo com `apps/web` em React/Vite e `apps/api` em Fastify, PostgreSQL e Prisma. O backend será um monólito modular por domínio. Não haverá `packages/` até existir reutilização concreta.

### Alternativas consideradas

Repositórios separados, microsserviços, Next.js, NestJS, FastAPI e um pacote compartilhado criado antecipadamente.

### Trade-offs

Scripts, CI e revisão ficam centralizados, com baixo custo operacional. Pode haver pequena duplicação de tipos entre cliente e API, preferível a uma abstração prematura neste prazo.

## ADR-003 — Snapshot e imutabilidade após publicação

### Contexto

Alterar filme, horário, local, preço ou assentos depois da venda pode invalidar a decisão de compra e quebrar reservas ou ingressos.

### Decisão

Salvar os dados relevantes da TMDb na sessão. Permitir mudanças estruturais apenas em `DRAFT`; uma sessão `PUBLISHED` é estruturalmente imutável no MVP. Correções exigem novo rascunho.

### Alternativas consideradas

Consultar sempre a TMDb, editar até a primeira venda, permitir alterações parciais ou versionar sessões.

### Trade-offs

A regra protege invariantes e é fácil de explicar. Reduz flexibilidade do organizador; cancelamento e migração de compradores ficam fora do MVP e devem constar como limitação.

## ADR-004 — Hold de 10 minutos com garantia no PostgreSQL

### Contexto

Uma checagem de disponibilidade no frontend ou um `if` no backend não impede duas requisições concorrentes de obter o mesmo assento.

### Decisão

Criar hold de 10 minutos em transação. Bloquear primeiro os assentos por ID crescente e depois as reservas relacionadas por ID crescente. Usar `UNIQUE(ReservationSeat.seatId)` como árbitro final. Expirar e liberar holds de forma lazy, atômica e na mesma ordem de locks usada pelo pagamento, sem cron/job.

### Alternativas consideradas

Reserva definitiva antes do checkout, somente constraint sem locks coordenados, cron, Redis, fila ou controle no frontend.

### Trade-offs

Há correção com múltiplas instâncias da API e sem infraestrutura adicional. Será necessário SQL de lock pontual por meio do Prisma, e um hold vencido só é normalizado quando consultado, disputado ou pago.

## ADR-005 — Pagamento simulado determinístico

### Contexto

O avaliador precisa reproduzir aprovação e recusa, sem integração financeira real.

### Decisão

O checkout oferece cenários explícitos `APPROVED` e `DECLINED`. O backend calcula o total. Aprovação, mudança da reserva e emissão dos ingressos ocorrem na mesma transação; recusa é registrada e libera o hold sem gerar ingresso.

### Alternativas consideradas

Sandbox de provedor real, resultado aleatório ou múltiplas tentativas na mesma reserva.

### Trade-offs

O fluxo é previsível, rápido de testar e suficiente para demonstrar regras de negócio. Não exercita webhooks nem falhas de um adquirente; nova tentativa começa por outra reserva.

## ADR-006 — QR HS256 e validação persistida

### Contexto

Um UUID ou código previsível no QR pode ser fabricado, e uma assinatura válida isoladamente não informa se o ingresso já foi usado.

### Decisão

Usar JWT/JWS HS256 com dados mínimos, segredo exclusivo em variável de ambiente, algoritmo fixado, emissor e audiência. Após validar a assinatura, consultar ticket, sessão e status no banco. Consumir com update condicional atômico.

A sessão escolhida pela portaria é a autoridade operacional. A precedência é `INVALID`, `WRONG_EVENT`, `ALREADY_USED` e, por fim, a tentativa de consumo `VALID`. Portanto, mesmo um ingresso já utilizado retorna `WRONG_EVENT` quando pertence a outra sessão, sem revelar seu estado de uso fora do contexto selecionado.

### Alternativas consideradas

ID puro, token próprio com HMAC e assinatura assimétrica.

### Trade-offs

HS256 é conhecido, pequeno e adequado a um único backend. Exige proteção e rotação operacional do segredo; rotação com múltiplas chaves não entra no MVP. O payload é legível e, por isso, não contém PII. A precedência reduz informação operacional exposta entre sessões, ao custo de não informar à portaria que o ingresso de outro evento já foi usado.

## ADR-007 — Compartilhamento por bearer link simples

### Contexto

Compartilhar precisa ser demonstrável sem expor a conta do cliente nem virar transferência ou revenda.

### Decisão

Gerar 32 bytes aleatórios para `/shared/:token`, armazenar somente `SHA-256(token)` e responder com `Cache-Control: no-store`. A página pública omite dados pessoais e pode exibir o ingresso e o QR enquanto o link e o ticket forem válidos.

### Alternativas consideradas

URL autenticada, ID do ticket, fragmento seguido de `POST /resolve`, ocultar o QR ou implementar transferência de titularidade.

### Trade-offs

O fluxo tem uma única URL e pouco código. Como todo bearer link, concede acesso a quem o possuir; hash, alta entropia, expiração/revogação e ausência de cache reduzem o risco, mas não impedem o destinatário de repassá-lo.

## ADR-008 — JWT, RBAC e ownership no backend

### Contexto

Proteger apenas páginas React permite chamadas diretas indevidas à API.

### Decisão

Usar senhas com Argon2id, JWT de autenticação e guards para `ORGANIZER`, `CUSTOMER` e `GATE`. Cada serviço também verifica ownership. O segredo de autenticação é separado do segredo dos ingressos.

### Alternativas consideradas

Sessão em servidor, autorização somente no frontend ou um único tipo de usuário.

### Trade-offs

JWT simplifica cliente e deploy, mas revogação imediata fica fora do MVP. A dupla verificação de papel e ownership adiciona código deliberado para evitar acesso horizontal.

## ADR-009 — Deploy como P0 estratégico

### Contexto

O deploy é opcional no enunciado, mas reduz a fricção de avaliação e demonstra integração real entre navegador, API e banco.

### Decisão

Considerar a entrega pronta somente após publicar e executar smoke test do frontend, API e PostgreSQL. O alvo inicial é Vercel para web e Railway para API/banco; execução local documentada permanece como fallback.

### Alternativas consideradas

Somente ambiente local, Render ou concentrar todos os serviços em uma plataforma.

### Trade-offs

Há valor alto para o avaliador, ao custo de tempo com CORS, HTTPS, migrations, seed e variáveis de ambiente. Um bloqueio externo deve ser documentado, não escondido.

## ADR-010 — Teto de 20 horas e ordem de cortes

### Contexto

Funcionalidades opcionais podem comprometer o fluxo principal e suas regras críticas.

### Decisão

Trabalhar com teto aproximado de 20 horas. Os primeiros cortes serão polling, filtros adicionais, containers de web/API no Compose e polimento extra. Shows, pagamento real, Redis, filas, microsserviços e demais itens fora de escopo não serão iniciados.

### Alternativas consideradas

Maximizar opcionais, suportar mais domínios ou adiar testes e deploy para o fim.

### Trade-offs

O produto terá menos amplitude, mas preserva robustez, documentação e uma demonstração ponta a ponta. Recursos P1 só começam após P0 funcional e verificável.

## ADR-011 — Identidade SEPTEM e linguagem por jornada

### Contexto

A primeira direção visual era funcional, porém excessivamente editorial e genérica. O teste manual conduzido pelo candidato mostrou baixa densidade de produto: slogans, espaço vazio e títulos de exibição recebiam mais atenção que filmes, horários, salas e preços. A interface ficou visualmente desalinhada da profundidade já existente no backend.

### Decisão

Rejeitar essa direção e adotar a marca visível `SEPTEM`, referência à sétima arte. A programação passa a colocar pôsteres, dados da sessão, escolha de lugares e compra acima de hero ou slogans. Customer e Organizer compartilham uma identidade contemporânea de rede de cinemas; Gate mantém linguagem própria, operacional e orientada à leitura rápida dos quatro resultados.

### Alternativas consideradas

Polir apenas cores e espaçamentos da interface anterior, adotar um dashboard SaaS genérico ou aplicar a mesma linguagem promocional a todas as jornadas.

### Trade-offs

O redesign exige revisão transversal de componentes, estados e responsividade, mas não altera contratos nem regras de negócio. Separar visualmente o Gate reduz uniformidade entre áreas em favor de clareza operacional e segurança na portaria.

## ADR-012 — Programação consumer orientada por data, filme e horário

### Contexto

O M6 v1 melhorou a identidade SEPTEM e as telas críticas, mas a revisão humana concluiu que a Home ainda preservava o modelo mental da primeira solução: uma lista de cards independentes de sessões. Interfaces reais de bilheteria e redes de cinema foram estudadas para entender sua arquitetura de informação, sem copiar apresentação ou componentes.

### Decisão

Organizar a experiência consumer na sequência `contexto/local → data → filme → horário → assento`. Um filme real da programação abre a página; datas são derivadas das sessões existentes; sessões da data são agrupadas por filme, cinema e sala; e cada horário é a ação que leva à escolha de lugares. Referências externas serviram apenas à hierarquia da informação. Componentes prontos analisados foram deliberadamente rejeitados para evitar novas dependências e aparência de template.

### Alternativas consideradas

Manter os cards de sessão com novo acabamento, copiar padrões visuais de uma rede existente ou instalar carrossel e biblioteca de UI.

### Trade-offs

A transformação client-side permanece simples e não exige contrato novo, mas agrupa filmes por título e data de lançamento porque o resumo público não expõe `tmdbId`. Datas e horários seguem o fuso do navegador, coerente com o comportamento já existente.

## ADR-013 — Cinema marquee e sistema de superfícies consumer

### Contexto

A V2 corrigiu o modelo mental da Home, porém a revisão visual humana ainda a considerou próxima demais da primeira direção: quase toda preta, composta por retângulos e divisores, com pôsteres tratados como miniaturas. A organização estava correta, mas a linguagem ainda parecia um wireframe bem estilizado em vez de uma rede de cinema.

### Decisão

Adotar na Home o sistema `Cinema Black + SEPTEM Red + Ticket Ivory`. Um filme real ocupa um stage cinematográfico criado a partir de seu próprio pôster; um rail dá protagonismo aos filmes em cartaz; e datas, cinemas, salas e horários vivem em uma prancha marfim conectada visualmente ao ingresso. Hierarquia, superfícies, imagem e espaçamento substituem a maior parte das bordas. Interfaces reais foram pesquisadas como referência de princípios, nunca como templates ou layouts a copiar.

### Alternativas consideradas

Aplicar apenas escala, hover e cantos novos à V2, copiar a composição de uma rede existente ou instalar componentes de carrossel e bibliotecas de UI/animação.

### Trade-offs

O resumo público não oferece backdrop; por isso a atmosfera reutiliza o pôster com blur e gradientes, sem fetch ou contrato adicional. A superfície clara exige estilos de contraste cuidadosamente escopados, mas mantém backend, dependências e arquitetura da informação intactos.

## ADR-014 — OpenAPI gerado sem duplicar validação

### Contexto

O avaliador precisa inspecionar e experimentar a API sem depender primeiro do frontend ou de conhecimento prévio das rotas. Ao mesmo tempo, os contratos já são validados com Zod e não devem ser reestruturados apenas para produzir documentação.

### Decisão

Usar os plugins oficiais `@fastify/swagger` e `@fastify/swagger-ui`, compatíveis com o Fastify 5, e publicar a interface em `/docs` e o documento em `/docs/json`. As 23 operações reais são organizadas por domínio, com bearer JWT declarado nas rotas protegidas e indicação concisa do papel exigido. A conversão dos schemas Zod é exclusiva da geração OpenAPI; a autorização e a validação em runtime permanecem no backend existente.

### Alternativas consideradas

Manter somente uma lista de endpoints no README, duplicar todos os contratos em JSON Schema ou introduzir outra biblioteca de validação e um type provider em toda a API.

### Trade-offs

A solução oferece documentação interativa com baixo impacto arquitetural e reaproveita os contratos de entrada existentes. Alguns schemas de resposta precisam ser descritos manualmente para representar os DTOs públicos, portanto devem permanecer sincronizados com os serviços; em compensação, evita-se uma refatoração ampla ou uma segunda validação em runtime.
