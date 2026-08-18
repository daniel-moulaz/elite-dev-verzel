# Elite Dev Verzel

Base técnica do desafio Full Stack da Verzel. Até o M3, o projeto contém o monorepo React/Fastify, PostgreSQL com Prisma, autenticação JWT, gestão de sessões pelo organizador e o fluxo público de escolha e hold de assentos.

## Requisitos

- Node.js 22.12 ou superior
- npm
- Docker com Docker Compose

## Configuração local

Na raiz do repositório:

```powershell
Copy-Item .env.example .env
npm ci
npm run db:up
npm run prisma:validate
npm run prisma:generate
npm run db:migrate:deploy
npm run db:seed
npm run db:check
```

Em shells Unix, use `cp .env.example .env`. Troque `JWT_SECRET` por uma string aleatória com pelo menos 32 caracteres e configure `TMDB_READ_ACCESS_TOKEN` com o **API Read Access Token** obtido nas [configurações de API da TMDb](https://www.themoviedb.org/settings/api). O token pertence somente à API; não use prefixo `VITE_` nem o exponha no navegador. `WEB_ORIGIN` restringe o CORS e `VITE_API_URL` aponta o frontend para a API. Nunca reutilize os placeholders locais em produção. Se o PowerShell bloquear `npm.ps1`, use `npm.cmd`.

Para criar migrations futuras durante o desenvolvimento, use `npm run db:migrate:dev -- --name nome_da_migration`.

## Desenvolvimento

```powershell
npm run dev
```

Esse comando inicia:

- frontend: `http://localhost:5173`;
- backend: `http://localhost:3333`;
- health check: `http://localhost:3333/health`.

Também é possível iniciar separadamente:

```powershell
npm run dev:web
npm run dev:api
```

## Contas de demonstração

O seed é idempotente e prepara somente estas contas no M1:

| Papel | E-mail | Senha |
|---|---|---|
| Organizador | `organizer@demo.local` | `Demo@123` |
| Cliente | `customer1@demo.local` | `Demo@123` |
| Cliente | `customer2@demo.local` | `Demo@123` |
| Portaria | `gate@demo.local` | `Demo@123` |

As senhas são persistidas somente como hashes Argon2id. Para testar a API no PowerShell:

```powershell
$body = @{ email = "organizer@demo.local"; password = "Demo@123" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "http://localhost:3333/auth/login" -ContentType "application/json" -Body $body
Invoke-RestMethod -Uri "http://localhost:3333/auth/me" -Headers @{ Authorization = "Bearer $($login.accessToken)" }
```

O frontend armazena somente o access token em `sessionStorage` e confirma tokens existentes em `GET /auth/me`. Organizadores pesquisam filmes, preparam rascunhos e publicam sessões. A programação publicada é pública; clientes autenticados podem escolher até seis assentos e criar um hold de 10 minutos. A área da portaria permanece temporária.

Para parar o PostgreSQL sem remover os dados:

```powershell
npm run db:stop
```

## Verificações

```powershell
npm run lint
npm run typecheck
npm test
npm run build
# ou execute todas as verificações acima:
npm run check
```

## Endpoints implementados

- `GET /catalog/movies` — filmes em cartaz; aceita `?q=texto` para busca;
- `GET /catalog/movies/:tmdbId` — detalhes do filme;
- `GET /organizer/sessions` — lista somente as sessões do organizador autenticado;
- `POST /organizer/sessions` — cria rascunho com snapshot TMDb e assentos;
- `GET /organizer/sessions/:id` — abre sessão própria;
- `PATCH /organizer/sessions/:id` — edita somente `DRAFT`;
- `POST /organizer/sessions/:id/publish` — publica e torna a estrutura imutável.
- `GET /sessions` — lista sessões públicas futuras; aceita `?q=texto`;
- `GET /sessions/:id` — exibe o detalhe público de uma sessão;
- `GET /sessions/:id/seats` — retorna disponibilidade derivada dos assentos;
- `POST /reservations` — cria hold de até seis assentos para `CUSTOMER`;
- `GET /reservations/:id` — consulta a reserva do próprio cliente e normaliza expiração lazy.

As rotas de catálogo TMDb e `/organizer/*` exigem JWT de `ORGANIZER`; criar e consultar reserva exige `CUSTOMER`. O catálogo externo usa `pt-BR` e região `BR`; sessões já criadas usam o snapshot persistido e não dependem da TMDb para leitura.

O PostgreSQL arbitra disputas de assento com locks ordenados e `UNIQUE(ReservationSeat.seatId)`. Holds vencidos são liberados quando consultados ou disputados, sem cron. O M3 ainda não inclui pagamento, ingresso, QR, compartilhamento ou cancelamento. Sessões publicadas permanecem estruturalmente imutáveis.
