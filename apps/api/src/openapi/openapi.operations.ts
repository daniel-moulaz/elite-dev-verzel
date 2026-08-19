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
import { documentedResponse } from './openapi.schemas.js'

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
      summary: 'Atualiza uma sessão em rascunho',
      description:
        'Requer papel ORGANIZER. Informe ao menos um campo; rows e seatsPerRow devem ser enviados juntos. Sessões publicadas são estruturalmente bloqueadas.',
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
        409: errorResponse('Sessão não pode mais ser editada.'),
        ...tmdbErrors,
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
  },

  reservations: {
    create: documentRoute({
      tags: ['Reservations'],
      operationId: 'createReservation',
      summary: 'Reserva temporariamente de um a seis assentos',
      description:
        'Requer papel CUSTOMER. seatIds não pode conter repetições. A reserva cria um hold de 10 minutos; a garantia contra dupla venda permanece no backend e no banco.',
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
  },

  sharing: {
    create: documentRoute({
      tags: ['Sharing'],
      operationId: 'createTicketShareLink',
      summary: 'Cria ou rotaciona o link público do ingresso',
      description:
        'Requer papel CUSTOMER. Um novo link invalida o anterior e não expõe dados pessoais do comprador.',
      security: bearerSecurity,
      params: zodInput(ticketParamsSchema),
      response: {
        201: documentedResponse('ShareLink', 'Link público criado.'),
        400: errorResponse('Identificador de ingresso inválido.'),
        ...authenticationErrors,
        404: errorResponse('Ingresso inexistente ou não pertencente ao usuário.'),
        409: errorResponse('Ingresso fora da janela de compartilhamento.'),
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
        'O token da URL é uma credencial sensível. A resposta não contém nome, e-mail ou identificação do comprador e não deve ser armazenada em cache.',
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
        'Requer papel GATE. Os resultados INVALID, WRONG_EVENT, ALREADY_USED e VALID usam HTTP 200. Somente VALID consome o ingresso, de forma atômica; WRONG_EVENT não o consome.',
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
