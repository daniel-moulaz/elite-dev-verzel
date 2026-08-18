# Elite Dev Verzel

Plataforma de sessões de cinema do desafio Full Stack da Verzel. Até o M4, o fluxo cobre publicação pelo organizador, escolha e hold de assentos, pagamento simulado, emissão de ingresso com QR assinado e compartilhamento seguro.

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

Em shells Unix, use `cp .env.example .env`. Troque `JWT_SECRET` e `TICKET_SIGNING_SECRET` por strings aleatórias diferentes, cada uma com pelo menos 32 caracteres. Configure `TMDB_READ_ACCESS_TOKEN` com o **API Read Access Token** obtido nas [configurações de API da TMDb](https://www.themoviedb.org/settings/api). Esses valores pertencem somente à API; não use prefixo `VITE_` nem os exponha no navegador. `WEB_ORIGIN` restringe o CORS e `VITE_API_URL` aponta o frontend para a API. Nunca reutilize os placeholders locais em produção. Se o PowerShell bloquear `npm.ps1`, use `npm.cmd`.

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

O seed é idempotente e prepara estas contas:

| Papel | E-mail | Senha |
|---|---|---|
| Organizador | `organizer@demo.local` | `Demo@123` |
| Cliente | `customer1@demo.local` | `Demo@123` |
| Cliente | `customer2@demo.local` | `Demo@123` |
| Portaria | `gate@demo.local` | `Demo@123` |

As senhas são persistidas somente como hashes Argon2id. O seed também cria duas sessões futuras: uma livre para testar reservas e pagamentos, e outra com um ingresso `VALID` para `customer2@demo.local`. Os snapshots são locais e o seed não chama a TMDb. Para testar a API no PowerShell:

```powershell
$body = @{ email = "organizer@demo.local"; password = "Demo@123" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "http://localhost:3333/auth/login" -ContentType "application/json" -Body $body
Invoke-RestMethod -Uri "http://localhost:3333/auth/me" -Headers @{ Authorization = "Bearer $($login.accessToken)" }
```

O frontend armazena somente o access token em `sessionStorage` e confirma tokens existentes em `GET /auth/me`. Organizadores pesquisam filmes, preparam rascunhos e publicam sessões. A programação publicada é pública; clientes autenticados escolhem até seis assentos, criam um hold de 10 minutos e simulam aprovação ou recusa sem informar cartão.

## Fluxo de demonstração do M4

1. Entre como `customer1@demo.local` e escolha uma sessão/assentos.
2. No resumo da reserva, selecione **Simular pagamento aprovado** para emitir um ingresso ou **Simular pagamento recusado** para liberar os lugares.
3. Abra **Meus ingressos** para visualizar o QR e o código manual.
4. Em um ingresso, gere, copie, rotacione ou revogue `/shared/:token`; a página pública não mostra dados pessoais.

O QR carrega um JWS HS256 com claims mínimos. O token é gerado sob demanda e confirmado no banco em uma etapa posterior da portaria. O link público usa token aleatório de 32 bytes; apenas seu SHA-256 é persistido.

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
- `GET /reservations/:id` — consulta a reserva do próprio cliente e normaliza expiração lazy;
- `POST /reservations/:id/payment` — simula `APPROVED` ou `DECLINED` atomicamente;
- `GET /me/tickets` — lista os ingressos do cliente autenticado;
- `GET /me/tickets/:id` — retorna o ingresso próprio e o token QR assinado;
- `POST /me/tickets/:id/share-link` — cria ou substitui o link compartilhável;
- `DELETE /me/tickets/:id/share-link` — revoga o link ativo;
- `GET /shared/:token` — mostra o ingresso sem PII e sem cache.

As rotas de catálogo TMDb e `/organizer/*` exigem JWT de `ORGANIZER`; criar e consultar reserva exige `CUSTOMER`. O catálogo externo usa `pt-BR` e região `BR`; sessões já criadas usam o snapshot persistido e não dependem da TMDb para leitura.

O PostgreSQL arbitra disputas e pagamentos com locks ordenados e `UNIQUE(ReservationSeat.seatId)`. Aprovação preserva a alocação; recusa e expiração a removem na mesma transação. Sessões publicadas permanecem estruturalmente imutáveis. A portaria, o consumo do ingresso e a câmera ainda não fazem parte do M4.
