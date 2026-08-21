import type { SwaggerTransform } from '@fastify/swagger'
import type { FastifySchema } from 'fastify'
import { z, type ZodType } from 'zod'
import { loginBodySchema } from '../modules/auth/auth.schemas.js'
import {
  catalogMovieParamsSchema,
  catalogMoviesQuerySchema,
} from '../modules/catalog/catalog.schemas.js'
import { consumeTicketBodySchema } from '../modules/gate/gate.schemas.js'
import {
  paymentParamsSchema,
  processPaymentBodySchema,
} from '../modules/payments/payments.schemas.js'
import {
  listPublicSessionsQuerySchema,
  publicSessionParamsSchema,
} from '../modules/public-sessions/public-sessions.schemas.js'
import {
  createReservationBodySchema,
  reservationParamsSchema,
} from '../modules/reservations/reservations.schemas.js'
import {
  createSessionBodySchema,
  sessionParamsSchema,
  updateSessionBodySchema,
} from '../modules/sessions/sessions.schemas.js'
import { sharedTicketParamsSchema } from '../modules/shared-tickets/shared-tickets.schemas.js'
import { ticketParamsSchema } from '../modules/tickets/tickets.schemas.js'
import { documentedResponse, eventStreamResponse } from './openapi.schemas.js'

const bearerSecurity = [{ bearerAuth: [] }] as const

function zodInput(schema: ZodType) {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
  })
}

function documentRoute(documentedSchema: FastifySchema): SwaggerTransform {
  return ({ schema, url }) => ({
    schema: { ...schema, ...documentedSchema },
    url: url === '/' ? url : url.replace(/\/$/u, ''),
  })
}

function errorResponse(description: string) {
  return documentedResponse('ErrorResponse', description)
}

const authenticationErrors = {
  401: errorResponse('Token ausente, inválido ou expirado.'),
  403: errorResponse('Papel sem permissão para esta operação.'),
}

const tmdbErrors = {
  502: errorResponse('A TMDb retornou uma resposta inválida.'),
  503: errorResponse('Integração com a TMDb não configurada.'),
  504: errorResponse('Tempo de resposta da TMDb esgotado.'),
}

export const apiDocumentation = {
  health: documentRoute({
    tags: ['Health'],
    operationId: 'getHealth',
    summary: 'Verifica a disponibilidade da API',
    response: {
      200: documentedResponse('HealthResponse', 'API disponível.'),
    },
  }),

  auth: {
    login: documentRoute({
      tags: ['Auth'],
      operationId: 'login',
      summary: 'Autentica um usuário',
      description:
        'Retorna o accessToken JWT usado no botão Authorize e os dados públicos do usuário.',
      body: zodInput(loginBodySchema),
      response: {
        200: documentedResponse('LoginResponse', 'Autenticação concluída.'),
        400: errorResponse('E-mail ou senha em formato inválido.'),
        401: errorResponse('Credenciais inválidas.'),
        429: errorResponse(
          'Tentativas de login malsucedidas demais a partir desta origem. O limite considera apenas a origem da requisição, nunca a conta, para que ninguém possa bloquear o login de outro usuário. O cabeçalho Retry-After informa quantos segundos faltam.',
        ),
      },
    }),
    me: documentRoute({
      tags: ['Auth'],
      operationId: 'getAuthenticatedUser',
      summary: 'Retorna o usuário autenticado',
      description: 'Requer um JWT válido de qualquer papel.',
      security: bearerSecurity,
      response: {
        200: documentedResponse('User', 'Usuário autenticado.'),
        401: authenticationErrors[401],
      },
    }),
  },

  catalog: {
    listMovies: documentRoute({
      tags: ['Catalog'],
      operationId: 'listCatalogMovies',
      summary: 'Lista ou busca filmes na TMDb',
      description:
        'Requer papel ORGANIZER. Sem busca, retorna os filmes em cartaz na TMDb.',
      security: bearerSecurity,
      querystring: zodInput(catalogMoviesQuerySchema),
      response: {
        200: documentedResponse(
          'CatalogMoviesResponse',
          'Filmes encontrados.',
        ),
        400: errorResponse('Busca em formato inválido.'),
        ...authenticationErrors,
        ...tmdbErrors,
      },
    }),
    getMovie: documentRoute({
      tags: ['Catalog'],
      operationId: 'getCatalogMovie',
      summary: 'Obtém detalhes de um filme da TMDb',
      description: 'Requer papel ORGANIZER.',
      security: bearerSecurity,
      params: zodInput(catalogMovieParamsSchema),
      response: {
        200: documentedResponse(
          'CatalogMovieDetails',
          'Detalhes do filme.',
        ),
        400: errorResponse('Identificador da TMDb inválido.'),
        ...authenticationErrors,
        404: errorResponse('Filme não encontrado.'),
        ...tmdbErrors,
      },
    }),
  },

  organizer: {
    createSession: documentRoute({
      tags: ['Organizer'],
      operationId: 'createOrganizerSession',
      summary: 'Cria uma sessão em rascunho',
      description:
        'Requer papel ORGANIZER. Salva um snapshot do filme consultado na TMDb.',
      security: bearerSecurity,
      body: zodInput(createSessionBodySchema),
      response: {
        201: documentedResponse('OrganizerSession', 'Sessão criada.'),
        400: errorResponse('Dados inválidos ou data no passado.'),
        ...authenticationErrors,
        404: errorResponse('Filme não encontrado na TMDb.'),
        ...tmdbErrors,
      },
    }),
    listSessions: documentRoute({
      tags: ['Organizer'],
      operationId: 'listOrganizerSessions',
      summary: 'Lista as sessões do organizador',
      description: 'Requer papel ORGANIZER.',
      security: bearerSecurity,
      response: {
        200: documentedResponse(
          'OrganizerSessionsResponse',
          'Sessões do organizador.',
        ),
        ...authenticationErrors,
      },
    }),
    getSession: documentRoute({
      tags: ['Organizer'],
      operationId: 'getOrganizerSession',
      summary: 'Obtém uma sessão do organizador',
      description:
        'Requer papel ORGANIZER. Sessões de outro organizador não são reveladas.',
      security: bearerSecurity,
      params: zodInput(sessionParamsSchema),
      response: {
        200: documentedResponse('OrganizerSession', 'Sessão encontrada.'),
        400: errorResponse('Identificador de sessão inválido.'),
        ...authenticationErrors,
        404: errorResponse('Sessão inexistente ou não pertencente ao usuário.'),
      },
    }),
    updateSession: documentRoute({
      tags: ['Organizer'],
      operationId: 'updateOrganizerSession',
      summary: 'Atualiza uma sessão editável',
      description:
        'Requer papel ORGANIZER e ownership. Informe ao menos um campo; rows e seatsPerRow devem ser enviados juntos. Uma sessão PUBLISHED continua editável enquanto a alteração for segura — sem hold ativo, sem compra paga, sem nenhum ingresso emitido e antes do início; ela permanece PUBLISHED e preserva publishedAt. A política é revalidada sob lock dentro da transação, então o campo editability do GET é um indicativo, não a autorização final.',
      security: bearerSecurity,
      params: zodInput(sessionParamsSchema),
      body: zodInput(updateSessionBodySchema),
      response: {
        200: documentedResponse('OrganizerSession', 'Sessão atualizada.'),
        400: errorResponse('Parâmetros ou corpo inválidos.'),
        ...authenticationErrors,
        404: errorResponse(
          'Sessão inexistente, não pertencente ao usuário ou filme não encontrado.',
        ),
        409: errorResponse(
          'Sessão não pode mais ser editada (SESSION_NOT_EDITABLE) ou o mapa não pode ser reconstruído por já possuir histórico de assentos (SESSION_LAYOUT_NOT_EDITABLE).',
        ),
        ...tmdbErrors,
      },
    }),
    duplicateSession: documentRoute({
      tags: ['Organizer'],
      operationId: 'duplicateOrganizerSession',
      summary: 'Duplica uma sessão como novo rascunho',
      description:
        'Requer papel ORGANIZER e ownership. A origem pode ser DRAFT ou PUBLISHED. Copia apenas a estrutura — snapshot do filme, local, sala, endereço, preço e formato do layout — gerando assentos com identificadores novos. Nada transacional é copiado: reservas, alocações, pagamentos, ingressos e links compartilhados permanecem exclusivos da origem. A cópia nasce DRAFT com publishedAt nulo e não consulta a TMDb novamente.',
      security: bearerSecurity,
      params: zodInput(sessionParamsSchema),
      response: {
        201: documentedResponse(
          'OrganizerSession',
          'Cópia criada como rascunho.',
        ),
        400: errorResponse('Identificador de sessão inválido.'),
        ...authenticationErrors,
        404: errorResponse('Sessão inexistente ou não pertencente ao usuário.'),
      },
    }),
    publishSession: documentRoute({
      tags: ['Organizer'],
      operationId: 'publishOrganizerSession',
      summary: 'Publica uma sessão',
      description:
        'Requer papel ORGANIZER. A publicação torna a sessão visível no catálogo e bloqueia alterações estruturais.',
      security: bearerSecurity,
      params: zodInput(sessionParamsSchema),
      response: {
        200: documentedResponse('OrganizerSession', 'Sessão publicada.'),
        400: errorResponse('Identificador de sessão inválido.'),
        ...authenticationErrors,
        404: errorResponse('Sessão inexistente ou não pertencente ao usuário.'),
        409: errorResponse('Sessão já publicada ou ainda não publicável.'),
      },
    }),
  },

  sessions: {
    list: documentRoute({
      tags: ['Sessions'],
      operationId: 'listPublicSessions',
      summary: 'Lista a programação pública',
      description: 'Retorna sessões publicadas e futuras.',
      querystring: zodInput(listPublicSessionsQuerySchema),
      response: {
        200: documentedResponse(
          'PublicSessionsResponse',
          'Sessões disponíveis no catálogo.',
        ),
        400: errorResponse('Busca em formato inválido.'),
      },
    }),
    get: documentRoute({
      tags: ['Sessions'],
      operationId: 'getPublicSession',
      summary: 'Obtém os detalhes de uma sessão pública',
      params: zodInput(publicSessionParamsSchema),
      response: {
        200: documentedResponse('PublicSessionDetail', 'Sessão encontrada.'),
        400: errorResponse('Identificador de sessão inválido.'),
        404: errorResponse('Sessão não encontrada.'),
      },
    }),
    seats: documentRoute({
      tags: ['Sessions'],
      operationId: 'getPublicSessionSeats',
      summary: 'Consulta a disponibilidade dos assentos',
      description:
        'Os estados refletem a disponibilidade atual; uma reserva ainda pode disputar o mesmo assento concorrentemente.',
      params: zodInput(publicSessionParamsSchema),
      response: {
        200: documentedResponse(
          'SeatAvailabilityResponse',
          'Mapa e estado atual dos assentos.',
        ),
        400: errorResponse('Identificador de sessão inválido.'),
        404: errorResponse('Sessão não encontrada.'),
      },
    }),
    events: documentRoute({
      tags: ['Sessions'],
      operationId: 'streamPublicSessionEvents',
      summary: 'Assina as invalidações de disponibilidade da sessão',
      description:
        'Stream Server-Sent Events de uma sessão publicada. Os eventos são apenas sinais de invalidação e nunca transportam o estado dos assentos, ingressos, credenciais ou dados pessoais: ao receber `sync` ou `seats-changed`, o cliente deve reconsultar GET /sessions/{id}/seats, e ao receber `session-changed` deve reconsultar GET /sessions/{id}. Esses snapshots permanecem a autoridade. O polling do cliente continua como rede de segurança caso um evento se perca.',
      params: zodInput(publicSessionParamsSchema),
      response: {
        200: eventStreamResponse(
          'Stream aberto. Emite `sync` na conexão e `seats-changed` a cada mudança real de disponibilidade.',
        ),
        400: errorResponse('Identificador de sessão inválido.'),
        404: errorResponse('Sessão não encontrada.'),
      },
    }),
  },

  reservations: {
    create: documentRoute({
      tags: ['Reservations'],
      operationId: 'createReservation',
      summary: 'Reserva temporariamente de um a seis assentos',
      description:
        'Requer papel CUSTOMER. seatIds não pode conter repetições. A reserva cria um hold de 10 minutos; um índice único parcial no PostgreSQL permite somente uma alocação ativa por assento.',
      security: bearerSecurity,
      body: zodInput(createReservationBodySchema),
      response: {
        201: documentedResponse('Reservation', 'Reserva temporária criada.'),
        400: errorResponse('Dados inválidos ou assento fora da sessão.'),
        ...authenticationErrors,
        409: errorResponse('Sessão ou assento indisponível.'),
      },
    }),
    get: documentRoute({
      tags: ['Reservations'],
      operationId: 'getReservation',
      summary: 'Obtém uma reserva do cliente',
      description:
        'Requer papel CUSTOMER. Reservas de outro cliente não são reveladas.',
      security: bearerSecurity,
      params: zodInput(reservationParamsSchema),
      response: {
        200: documentedResponse('Reservation', 'Reserva encontrada.'),
        400: errorResponse('Identificador de reserva inválido.'),
        ...authenticationErrors,
        404: errorResponse('Reserva inexistente ou não pertencente ao usuário.'),
      },
    }),
    cancel: documentRoute({
      tags: ['Reservations'],
      operationId: 'cancelReservation',
      summary: 'Cancela uma compra paga inteira',
      description:
        'Requer papel CUSTOMER e ownership. Cancela atomicamente todos os ingressos ainda VALID da compra futura e devolve seus assentos ao estoque; ingressos já cancelados individualmente não são afetados novamente. O pagamento APPROVED permanece como histórico; não existe estorno financeiro real.',
      security: bearerSecurity,
      params: zodInput(reservationParamsSchema),
      response: {
        200: documentedResponse(
          'ReservationCancellationResult',
          'Compra e todos os seus ingressos cancelados.',
        ),
        400: errorResponse('Identificador de reserva inválido.'),
        ...authenticationErrors,
        404: errorResponse('Reserva inexistente ou não pertencente ao usuário.'),
        409: errorResponse(
          'Compra já cancelada, não paga, iniciada ou com ingresso utilizado.',
        ),
      },
    }),
  },

  payments: {
    process: documentRoute({
      tags: ['Payments'],
      operationId: 'processReservationPayment',
      summary: 'Processa o pagamento demonstrativo',
      description:
        'Requer papel CUSTOMER. APPROVED cria os ingressos; DECLINED cancela a reserva e libera os assentos. O resultado é final para a reserva.',
      security: bearerSecurity,
      params: zodInput(paymentParamsSchema),
      body: zodInput(processPaymentBodySchema),
      response: {
        200: documentedResponse('PaymentResult', 'Pagamento processado.'),
        400: errorResponse('Parâmetros ou corpo inválidos.'),
        ...authenticationErrors,
        404: errorResponse('Reserva inexistente ou não pertencente ao usuário.'),
        409: errorResponse('Reserva expirada ou pagamento indisponível.'),
      },
    }),
  },

  tickets: {
    list: documentRoute({
      tags: ['Tickets'],
      operationId: 'listCustomerTickets',
      summary: 'Lista os ingressos do cliente',
      description: 'Requer papel CUSTOMER.',
      security: bearerSecurity,
      response: {
        200: documentedResponse(
          'TicketListResponse',
          'Ingressos do cliente.',
        ),
        ...authenticationErrors,
      },
    }),
    get: documentRoute({
      tags: ['Tickets'],
      operationId: 'getCustomerTicket',
      summary: 'Obtém o ingresso digital',
      description:
        'Requer papel CUSTOMER. Ingressos de outro cliente não são revelados. A resposta não deve ser armazenada em cache.',
      security: bearerSecurity,
      params: zodInput(ticketParamsSchema),
      response: {
        200: documentedResponse('TicketDetail', 'Ingresso digital.'),
        400: errorResponse('Identificador de ingresso inválido.'),
        ...authenticationErrors,
        404: errorResponse('Ingresso inexistente ou não pertencente ao usuário.'),
      },
    }),
    cancel: documentRoute({
      tags: ['Tickets'],
      operationId: 'cancelCustomerTicket',
      summary: 'Cancela um ingresso individual',
      description:
        'Requer papel CUSTOMER e ownership. Cancela atomicamente somente este ingresso e libera o assento correspondente; os demais ingressos da mesma compra não são afetados. Quando este é o último ingresso ainda VALID da compra, a reserva também passa a CANCELLED. O pagamento APPROVED permanece como histórico; não existe estorno financeiro real.',
      security: bearerSecurity,
      params: zodInput(ticketParamsSchema),
      response: {
        200: documentedResponse(
          'TicketCancellationResult',
          'Ingresso e, quando aplicável, a compra cancelados.',
        ),
        400: errorResponse('Identificador de ingresso inválido.'),
        ...authenticationErrors,
        404: errorResponse('Ingresso inexistente ou não pertencente ao usuário.'),
        409: errorResponse(
          'Ingresso não está VALID ou a sessão já foi iniciada.',
        ),
      },
    }),
  },

  sharing: {
    create: documentRoute({
      tags: ['Sharing'],
      operationId: 'createTicketShareLink',
      summary: 'Cria ou rotaciona o link público do ingresso',
      description:
        'Requer papel CUSTOMER. Um novo link invalida o anterior e não expõe dados pessoais do comprador. Ingressos cancelados não geram novos links.',
      security: bearerSecurity,
      params: zodInput(ticketParamsSchema),
      response: {
        201: documentedResponse('ShareLink', 'Link público criado.'),
        400: errorResponse('Identificador de ingresso inválido.'),
        ...authenticationErrors,
        404: errorResponse('Ingresso inexistente ou não pertencente ao usuário.'),
        409: errorResponse(
          'Ingresso cancelado ou fora da janela de compartilhamento.',
        ),
      },
    }),
    revoke: documentRoute({
      tags: ['Sharing'],
      operationId: 'revokeTicketShareLink',
      summary: 'Revoga o link público do ingresso',
      description:
        'Requer papel CUSTOMER. A operação é idempotente quando o ingresso existe.',
      security: bearerSecurity,
      params: zodInput(ticketParamsSchema),
      response: {
        204: { description: 'Link revogado.' },
        400: errorResponse('Identificador de ingresso inválido.'),
        ...authenticationErrors,
        404: errorResponse('Ingresso inexistente ou não pertencente ao usuário.'),
      },
    }),
    getPublic: documentRoute({
      tags: ['Sharing'],
      operationId: 'getSharedTicket',
      summary: 'Obtém um ingresso pelo link público',
      description:
        'O token da URL é uma credencial sensível. A resposta não contém nome, e-mail ou identificação do comprador e não deve ser armazenada em cache. Um link já existente continua mostrando o estado CANCELLED, sem QR ou código manual utilizável.',
      params: zodInput(sharedTicketParamsSchema),
      response: {
        200: documentedResponse('SharedTicket', 'Ingresso compartilhado.'),
        404: errorResponse('Link inválido, desconhecido ou rotacionado.'),
        410: errorResponse('Link revogado ou expirado.'),
      },
    }),
  },

  gate: {
    listSessions: documentRoute({
      tags: ['Gate'],
      operationId: 'listGateSessions',
      summary: 'Lista as sessões disponíveis na portaria',
      description: 'Requer papel GATE.',
      security: bearerSecurity,
      response: {
        200: documentedResponse(
          'GateSessionsResponse',
          'Sessões selecionáveis na portaria.',
        ),
        ...authenticationErrors,
      },
    }),
    consumeTicket: documentRoute({
      tags: ['Gate'],
      operationId: 'consumeGateTicket',
      summary: 'Valida e consome uma credencial de ingresso',
      description:
        'Requer papel GATE. Os resultados INVALID, WRONG_EVENT, ALREADY_USED e VALID usam HTTP 200. Somente VALID consome o ingresso, de forma atômica; WRONG_EVENT não o consome e, para uma sessão selecionada válida, uma credencial cancelada resulta em INVALID.',
      security: bearerSecurity,
      body: zodInput(consumeTicketBodySchema),
      response: {
        200: documentedResponse(
          'GateConsumeResult',
          'Resultado de negócio da validação.',
        ),
        400: errorResponse('Sessão ou credencial em formato inválido.'),
        ...authenticationErrors,
        404: errorResponse('Sessão selecionada não encontrada.'),
      },
    }),
  },
} as const
