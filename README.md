# Elite Dev Verzel

Fundação técnica do desafio Full Stack da Verzel. O M0 contém somente o monorepo, uma aplicação React mínima, a API Fastify com `GET /health` e PostgreSQL configurado para desenvolvimento.

## Requisitos

- Node.js 22.12 ou superior
- npm
- Docker com Docker Compose

## Configuração local

Na raiz do repositório:

```powershell
Copy-Item .env.example .env
npm install
npm run db:up
npm run prisma:validate
npm run prisma:generate
npm run db:check
```

Em shells Unix, use `cp .env.example .env`. Os valores do exemplo são apenas para desenvolvimento local. Se o PowerShell bloquear `npm.ps1`, execute os mesmos comandos com `npm.cmd`.

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

O schema Prisma está intencionalmente sem entidades de domínio no M0. Models e migrations serão adicionados somente no milestone autorizado correspondente.
