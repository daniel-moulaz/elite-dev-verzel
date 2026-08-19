# Arquitetura

## Visão geral

A solução será um monólito modular com frontend e backend separados no mesmo repositório. O navegador nunca acessa a TMDb nem o PostgreSQL diretamente.

```text
React/Vite ──HTTP/JSON──> Fastify ──Prisma/SQL──> PostgreSQL
                              │
                              └────HTTPS────> TMDb
```

Estrutura planejada, sem pacote compartilhado prematuro:

```text
apps/
  web/          # páginas, componentes e acesso à API
  api/          # módulos HTTP, regras de negócio e persistência
docs/           # requisitos, arquitetura, decisões e uso de IA
compose.yaml    # PostgreSQL local; web/API são opcionais
```

## Responsabilidades

### Frontend

O React organiza telas por jornada: catálogo e sessão, checkout, ingressos, organizador e portaria. Uma camada HTTP centraliza URL, token e normalização de erros. Estado permanece local às features; não haverá biblioteca global sem necessidade concreta.

Proteções de rota melhoram a UX, mas não substituem autorização no backend. Toda tela inclui loading, estado vazio, erro recuperável e feedback da ação.

### Backend

O Fastify é dividido por domínio: `auth`, `movies`, `sessions`, `reservations`, `payments`, `tickets`, `sharing` e `gate`. Cada módulo contém rotas e schemas Zod, serviço com a regra de negócio e acesso Prisma/SQL. Plugins comuns cuidam de configuração, autenticação, erros e Swagger.

As rotas validam contrato, identidade, papel e ownership. Serviços coordenam transações. O PostgreSQL mantém as garantias finais de unicidade e transição de estado.

A especificação OpenAPI descreve as operações reais da API e fica disponível com Swagger UI em `/docs` e como JSON em `/docs/json`. Os schemas Zod existentes continuam sendo a fonte da validação em runtime; sua conversão para JSON Schema ocorre somente durante a geração da documentação, sem introduzir uma segunda camada de validação.

## Modelo conceitual

| Entidade | Dados e relações principais | Garantias e índices |
|---|---|---|
| `User` | e-mail, `passwordHash`, papel | e-mail único |
| `Session` | organizador, snapshot TMDb, horário, local, preço em centavos, status | índices por `status/startsAt` e `organizerId`; estrutura imutável após `PUBLISHED` |
| `Seat` | sessão, fileira, número e label | `UNIQUE(sessionId, label)` |
| `Reservation` | cliente, sessão, status, `expiresAt`, total | índices por cliente, sessão, status e expiração |
| `ReservationSeat` | reserva e assento | `UNIQUE(seatId)` é o árbitro final; vínculo é removido ao liberar hold |
| `Payment` | reserva, valor, resultado e timestamps | `UNIQUE(reservationId)`; valor vindo do backend |
| `Ticket` | sessão, assento reservado, código manual, status, `usedAt` e GATE responsável | vínculo e código únicos; índices por sessão e status |
| `SharedTicketLink` | ingresso, `tokenHash`, expiração/revogação | ingresso e hash únicos; token puro nunca é persistido |

O snapshot do filme fica em `Session` (`tmdbId`, título, pôster, sinopse, duração e classificação disponível). Uma tabela separada não agrega valor ao MVP. Datas são armazenadas em UTC e valores monetários em centavos.

Estados mínimos:

- sessão: `DRAFT -> PUBLISHED`;
- reserva: `PENDING -> PAID | EXPIRED | CANCELLED`;
- pagamento: `APPROVED | DECLINED` como resultado final da simulação;
- ingresso: `VALID -> USED`.

Cancelamento de sessão/ingresso e reembolso ficam fora do MVP.

## Fluxos críticos

### Sessão e TMDb

O organizador pesquisa pelo backend. A API trata timeout, indisponibilidade e respostas inválidas da TMDb. Ao criar o rascunho, salva um snapshot; a exibição futura não depende do catálogo externo. A chave existe somente no ambiente da API. Cache distribuído não é necessário.

Sessões `DRAFT` aceitam edição. Depois de `PUBLISHED`, filme, horário, local, preço, capacidade e mapa de assentos não mudam. Essa regra protege reservas e ingressos já emitidos e reduz estados difíceis de reconciliar.

### Hold e concorrência

O hold dura 10 minutos e usa o relógio do banco. Todas as operações que disputam ou liberam assentos seguem a mesma ordem de locks:

1. bloquear linhas de `Seat` por `id` crescente;
2. bloquear as `Reservation` relacionadas por `id` crescente;
3. bloquear e revalidar os `ReservationSeat` relacionados;
4. validar status e `expiresAt` com o relógio do banco;
5. alterar reserva e vínculos dentro da mesma transação.

Na criação, a transação libera claims `PENDING` expirados, rejeita claims ainda ativos ou pagos e insere a nova reserva. `UNIQUE(ReservationSeat.seatId)` continua sendo a garantia final contra corrida.

A expiração é lazy: consulta de disponibilidade, nova disputa e pagamento podem encontrá-la. A liberação marca a reserva como `EXPIRED` e remove seus vínculos sem sair da transação. Não há cron/job. Erros de unicidade viram conflito de domínio, nunca venda dupla.

### Pagamento e emissão

O cliente envia somente o cenário reproduzível `APPROVED` ou `DECLINED`; a API recalcula valor e valida ownership. O pagamento adquire locks na mesma ordem do hold. Se a reserva já expirou, ela é expirada e liberada atomicamente.

Na aprovação, uma transação registra `Payment`, move a reserva para `PAID` e cria um `Ticket` por assento. Na recusa, registra `DECLINED`, move a reserva para `CANCELLED` e libera os assentos. Nenhum ingresso existe antes do commit aprovado.

As FKs de `Payment` e `Ticket` usam `RESTRICT` sobre a reserva paga e sua alocação. Não existe fluxo de exclusão de reserva paga; a alocação continua sendo a fonte da indisponibilidade do assento.

### QR e consumo

O QR contém um JWT/JWS HS256 com payload mínimo: versão, tipo, `jti` do ingresso, `sid` da sessão e claims de emissor, audiência e validade. `TICKET_SIGNING_SECRET` é forte, exclusivo e separado do segredo de login; o algoritmo aceito é fixado no verificador.

O token não é persistido: o backend o gera a partir do ingresso e do snapshot da sessão a cada detalhe. A validade termina após a duração do filme — ou 180 minutos quando ausente — mais duas horas de margem.

O código para entrada manual também é aleatório, único e possui entropia suficiente para não ser enumerável na interface autenticada da portaria.

A portaria escolhe a sessão, lê o QR pela câmera ou informa o código manual. A API valida assinatura e claims e confirma ingresso, sessão e status no banco. O consumo usa update condicional equivalente a:

```sql
UPDATE "Ticket"
SET
  status = 'USED',
  "usedAt" = clock_timestamp(),
  "usedByGateId" = $3
WHERE id = $1 AND "sessionId" = $2 AND status = 'VALID';
```

Uma linha alterada produz `VALID`. A credencial inexistente ou criptograficamente inválida produz `INVALID`; um ticket de outra sessão produz `WRONG_EVENT` antes da inspeção do status; e um ticket já consumido na sessão selecionada produz `ALREADY_USED`. Caso o update retorne zero depois de uma leitura `VALID`, uma releitura controlada identifica o vencedor concorrente. Assim, somente um dos dois dispositivos concorrentes obtém `VALID`; o outro recebe `ALREADY_USED`.

O frontend da portaria usa a câmera do dispositivo e decodificação QR no navegador, carregada somente nessa jornada. O scanner para antes de enviar a credencial, permanece parado durante a resposta e só reinicia após a ação explícita de validar o próximo ingresso. A entrada manual permanece disponível mesmo sem permissão ou câmera. Em produção, `getUserMedia` exige HTTPS.

### Compartilhamento

Ao compartilhar, a API gera 32 bytes criptograficamente aleatórios e devolve `/shared/:token`. Persiste apenas `SHA-256(token)`. O endpoint público calcula o hash, consulta o link e mostra o ingresso/QR sem dados pessoais, enquanto link e ingresso forem válidos.

O link é uma credencial bearer: quem o recebe pode apresentar o ingresso. A resposta usa `Cache-Control: no-store` e `X-Robots-Tag: noindex, nofollow`. Não há transferência, revenda nem fluxo com fragmento e `POST /resolve`.

## Autenticação e autorização

Senhas usam Argon2id. O login emite JWT bearer com duração de 8 horas e segredo separado do ingresso. Um pre-handler autentica; guards verificam papel e serviços confirmam ownership na consulta ou mutação. IDs, papéis e preços recebidos do frontend nunca são aceitos como autoridade.

Contas são fornecidas por seed no MVP; cadastro e recuperação de senha não são necessários.

## Contrato REST essencial

| Método e rota | Acesso | Finalidade |
|---|---|---|
| `POST /auth/login` | público | autenticar conta de demonstração |
| `GET /catalog/movies` | organizer | listar filmes em cartaz ou pesquisar TMDb com `?q=` |
| `GET /catalog/movies/:tmdbId` | organizer | obter detalhes do filme pelo backend |
| `GET /organizer/sessions` | organizer | listar sessões próprias |
| `POST /organizer/sessions` | organizer | criar rascunho e assentos |
| `GET/PATCH /organizer/sessions/:id` | owner | consultar ou editar rascunho |
| `POST /organizer/sessions/:id/publish` | owner | publicar sessão válida |
| `GET /sessions` | público | listar e buscar sessões publicadas |
| `GET /sessions/:id` | público | obter detalhes |
| `GET /sessions/:id/seats` | público | obter disponibilidade atual |
| `POST /reservations` | customer | criar hold para sessão e assentos informados |
| `GET /reservations/:id` | owner customer | consultar hold e normalizar expiração lazy |
| `POST /reservations/:id/payment` | owner customer | aprovar ou recusar simulação |
| `GET /me/tickets` | customer | listar ingressos próprios |
| `GET /me/tickets/:id` | owner customer | abrir ingresso digital |
| `POST /me/tickets/:id/share-link` | owner customer | criar ou substituir link compartilhável |
| `DELETE /me/tickets/:id/share-link` | owner customer | revogar o link ativo |
| `GET /shared/:token` | público | abrir ingresso compartilhado sem cache |
| `GET /gate/sessions` | gate | escolher sessão publicada |
| `POST /gate/tickets/consume` | gate | validar e consumir QR/código no contexto da sessão escolhida |

## Execução, CI e deploy

Em desenvolvimento, o Compose contém apenas PostgreSQL; web e API rodam localmente para feedback rápido. Swagger/OpenAPI já permite inspecionar e testar a API, enquanto o workflow de CI (`install`, lint, typecheck, testes e build) permanece para um bloco posterior.

O alvo de publicação é frontend na Vercel e API/PostgreSQL no Railway, com HTTPS, migrations, seed, CORS e variáveis de ambiente configurados. O smoke test em produção percorre os três papéis. Se o teto de 20 horas apertar, os primeiros cortes são polling, filtros extras, containers de web/API e polimento adicional, não as garantias transacionais nem o deploy.
