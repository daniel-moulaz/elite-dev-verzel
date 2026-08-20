# Requisitos do Produto

## Escopo e fontes

O desafio técnico oficial é a fonte de verdade. O produto será uma plataforma focada exclusivamente em cinema, utilizando a TMDb como catálogo externo e priorizando um fluxo simples, completo e reproduzível.

Fluxo principal: o organizador escolhe um filme e publica uma sessão; o cliente encontra a sessão, reserva um assento, realiza um pagamento simulado e recebe um ingresso; a portaria valida e consome esse ingresso por QR Code ou código manual.

## Requisitos funcionais P0

### Acesso e papéis

- Autenticar contas de demonstração por e-mail e senha.
- Aplicar no backend os papéis `ORGANIZER`, `CUSTOMER` e `GATE`.
- Verificar ownership: organizadores acessam somente suas sessões e clientes somente seus ingressos e reservas.

### Organizador e catálogo

- Pesquisar filmes da TMDb por meio do backend, sem expor a chave ao navegador.
- Criar e editar uma sessão em rascunho com filme, data e hora, local/sala, preço e mapa de assentos.
- Salvar um snapshot dos dados relevantes do filme ao criar a sessão.
- Publicar e listar as próprias sessões.
- Tornar filme, horário, local, preço e mapa de assentos imutáveis após a publicação. Uma correção estrutural exige nova sessão no MVP.

### Cliente, reserva e pagamento

- Listar sessões publicadas, realizar busca textual básica e abrir seus detalhes.
- Exibir um mapa com assentos disponíveis, ocupados e temporariamente reservados.
- Criar um hold de 10 minutos para os assentos escolhidos.
- Expirar holds de forma lazy e atômica, sem cron ou job.
- Impedir no PostgreSQL que duas reservas mantenham o mesmo assento.
- Simular pagamentos com resultados reproduzíveis `APPROVED` e `DECLINED`, usando sempre o preço calculado pelo backend.
- Emitir ingresso somente quando o pagamento for aprovado; uma recusa cancela a reserva e libera o hold.
- Listar “Meus ingressos” e exibir ingresso digital com QR Code e código manual.

### Compartilhamento e portaria

- Criar um link bearer em `/shared/:token` com token aleatório forte; persistir somente seu hash.
- Exibir no link apenas os dados necessários do ingresso, com `Cache-Control: no-store`, sem transferir sua propriedade.
- Permitir que a portaria selecione uma sessão, leia o QR pela câmera ou informe o código manual.
- Retornar de forma inequívoca `VALID`, `INVALID`, `ALREADY_USED` ou `WRONG_EVENT`.
- Consumir o ingresso atomicamente, permitindo somente um sucesso em validações concorrentes.

### Entrega

- Disponibilizar dados de demonstração para os três papéis e ao menos uma sessão publicada.
- Publicar frontend, API e PostgreSQL. Embora opcional no enunciado, o deploy é P0 estratégico desta entrega.
- Documentar instalação, credenciais fictícias, cenários de pagamento, arquitetura, limitações e uso de IA no README final.

## Requisitos não funcionais

- Usar React, TypeScript e Vite no frontend; Node.js, TypeScript e Fastify no backend; PostgreSQL e Prisma na persistência.
- Validar entradas externas, armazenar senhas com hash apropriado e manter secrets somente em variáveis de ambiente.
- Implementar loading, empty state, feedback de sucesso e erros compreensíveis nas jornadas principais.
- Oferecer interface responsiva, acessibilidade básica e identidade visual ligada a cinema e ingresso digital.
- Cobrir por integração autenticação, RBAC/ownership, concorrência de assentos, pagamentos, emissão, adulteração e consumo do ingresso.
- Manter o escopo executável em até aproximadamente 20 horas.

## Prioridades posteriores

### P1 — forte diferencial

- Swagger/OpenAPI, GitHub Actions e Docker Compose mínimo para PostgreSQL.
- Testes e acabamento responsivo das jornadas críticas além do mínimo de aceitação.

### P2 — somente com folga

- Polling de disponibilidade, filtros adicionais, containers de web/API no Compose e polimento visual extra.
- Cancelamento de sessão, métricas, atualização em tempo real e automações operacionais.

Os itens de P2 e, depois, os refinamentos de P1 são cortes antes de qualquer redução do fluxo P0 ou de suas garantias de segurança.

## Fora de escopo

- Shows, pista ou múltiplos tipos de evento.
- Pagamento financeiro real, reembolso, revenda, nota fiscal ou envio de ingresso por e-mail.
- Recuperação de senha, aplicativo nativo e transferência de titularidade.
- Redis, filas, microsserviços ou arquitetura orientada a eventos.

## Critérios essenciais de aceite

1. Dois clientes disputando o mesmo assento resultam em, no máximo, um hold ativo.
2. Hold expirado é liberado atomicamente antes de nova reserva ou pagamento.
3. Pagamento aprovado cria ingresso; pagamento recusado nunca cria ingresso válido.
4. QR adulterado falha, mesmo que contenha um identificador existente.
5. Duas validações simultâneas do mesmo ingresso geram um único `VALID`.
6. Um ingresso de outra sessão resulta em `WRONG_EVENT` e não é consumido.
7. O link compartilhado não é armazenado em texto puro nem pode ser cacheado.
8. As jornadas dos três papéis funcionam no deploy e com os dados de demonstração.
