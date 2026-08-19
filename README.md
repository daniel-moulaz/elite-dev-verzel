# Elite Dev Verzel

[![CI](https://github.com/daniel-moulaz/elite-dev-verzel/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/daniel-moulaz/elite-dev-verzel/actions/workflows/ci.yml)

SEPTEM é a identidade visível da plataforma de sessões de cinema deste desafio Full Stack da Verzel. O fluxo cobre publicação pelo organizador, escolha e hold de assentos, pagamento simulado, emissão de ingresso com QR assinado, compartilhamento seguro e consumo atômico pela portaria.

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
- API documentation: `http://localhost:3333/docs`;
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

## Fluxo de demonstração do ingresso

1. Entre como `customer1@demo.local` e escolha uma sessão/assentos.
2. No resumo da reserva, selecione **Aprovar pagamento** para emitir um ingresso ou **Recusar pagamento** para liberar os lugares.
3. Abra **Meus ingressos** para visualizar o QR e o código manual.
4. Em um ingresso, gere, copie, rotacione ou revogue `/shared/:token`; a página pública não mostra dados pessoais.

O QR carrega um JWS HS256 com claims mínimos. O token é gerado sob demanda e confirmado no banco em uma etapa posterior da portaria. O link público usa token aleatório de 32 bytes; apenas seu SHA-256 é persistido.

## Portaria: câmera, código manual e quatro resultados

O seed prepara um ingresso `VALID` de **Matrix**, assento A1, para `customer2@demo.local`, além da sessão de **Interestelar** necessária para demonstrar evento errado. Para repetir a demonstração desde o início, execute `npm run db:seed`; o seed restaura o ingresso demo para `VALID` sem trocar seu código manual.

1. Em uma janela ou dispositivo, entre como `customer2@demo.local`, abra **Meus ingressos** e mantenha o ingresso de Matrix visível. O QR e o código `XXXX-XXXX-XXXX-XXXX` são credenciais alternativas do mesmo ingresso.
2. Em outra janela, perfil ou dispositivo, entre como `gate@demo.local` e selecione uma sessão publicada.
3. Autorize a câmera, aponte para o QR inteiro dentro da marcação ou digite o código manual e pressione **Validar ingresso**.
4. Após cada resposta, use **Validar próximo ingresso** para limpar a leitura e reabrir a câmera.

Roteiro dos resultados:

- selecione **Interestelar** e apresente o ingresso de Matrix: `WRONG_EVENT`; o ingresso não é alterado;
- troque para **Matrix** e apresente o mesmo ingresso: `VALID`; o backend o move para `USED` com horário do PostgreSQL e o GATE autenticado;
- apresente novamente em Matrix: `ALREADY_USED`;
- digite uma credencial deliberadamente malformada, como `INVALIDO`: `INVALID`, sem revelar detalhes criptográficos.

A câmera usa `getUserMedia`: em produção ela requer HTTPS e permissão do navegador; `localhost` é aceito como contexto seguro para desenvolvimento. Um celular acessando `http://<IP-da-rede>` normalmente não receberá acesso à câmera, então use o deploy HTTPS para o teste físico. Permissão negada, câmera ausente ou ocupada não bloqueiam a alternativa manual.

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
- `GET /gate/sessions` — lista sessões `PUBLISHED` para o GATE selecionar;
- `POST /gate/tickets/consume` — valida QR/código e consome o ingresso atomicamente.

As rotas de catálogo TMDb e `/organizer/*` exigem JWT de `ORGANIZER`; criar e consultar reserva exige `CUSTOMER`. O catálogo externo usa `pt-BR` e região `BR`; sessões já criadas usam o snapshot persistido e não dependem da TMDb para leitura.

O PostgreSQL arbitra disputas e pagamentos com locks ordenados e `UNIQUE(ReservationSeat.seatId)`. Aprovação preserva a alocação; recusa e expiração a removem na mesma transação. Sessões publicadas permanecem estruturalmente imutáveis. Na portaria, um `UPDATE` condicionado a `status = 'VALID'` garante um único `VALID` mesmo quando dois dispositivos apresentam o ingresso ao mesmo tempo.
