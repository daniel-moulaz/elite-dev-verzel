# Elite Dev Verzel

Base técnica do desafio Full Stack da Verzel. Até o M1, o projeto contém o monorepo React/Fastify, PostgreSQL com Prisma e autenticação JWT para os papéis `ORGANIZER`, `CUSTOMER` e `GATE`.

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

Em shells Unix, use `cp .env.example .env`. Troque `JWT_SECRET` por uma string aleatória com pelo menos 32 caracteres; nunca reutilize os valores locais em produção. `WEB_ORIGIN` restringe o CORS e `VITE_API_URL` aponta o frontend para a API. Se o PowerShell bloquear `npm.ps1`, use `npm.cmd`.

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

O frontend armazena somente o access token em `sessionStorage`, confirma tokens existentes em `GET /auth/me` e exibe uma área temporária correspondente ao papel autenticado.

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
```

Os endpoints atuais são `GET /health`, `POST /auth/login` e `GET /auth/me`. O M1 não inclui cadastro, refresh token, recuperação de senha ou logout no servidor. Ownership será aplicado nos services quando sessões, reservas e ingressos forem introduzidos; nenhuma dessas entidades faz parte deste milestone.
