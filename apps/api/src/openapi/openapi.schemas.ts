import type { FastifyDynamicSwaggerOptions } from '@fastify/swagger'

type OpenApiDocument = NonNullable<
  FastifyDynamicSwaggerOptions['openapi']
>
type ComponentSchemas = NonNullable<
  NonNullable<OpenApiDocument['components']>['schemas']
>
type SchemaObject = Exclude<ComponentSchemas[string], { $ref: string }>
type SchemaProperties = NonNullable<SchemaObject['properties']>

const uuidSchema: SchemaObject = {
  type: 'string',
  format: 'uuid',
}

const dateTimeSchema: SchemaObject = {
  type: 'string',
  format: 'date-time',
}

const nullableDateTimeSchema: SchemaObject = {
  type: 'string',
  format: 'date-time',
  nullable: true,
}

const nullableDateSchema: SchemaObject = {
  type: 'string',
  format: 'date',
  nullable: true,
}

const nullableTextSchema: SchemaObject = {
  type: 'string',
  nullable: true,
}

const catalogMovieProperties: SchemaProperties = {
  id: { type: 'integer', minimum: 1 },
  title: { type: 'string' },
  overview: { type: 'string' },
  posterPath: nullableTextSchema,
  backdropPath: nullableTextSchema,
  releaseDate: nullableDateSchema,
}

const ticketSummaryProperties: SchemaProperties = {
  id: uuidSchema,
  status: {
    type: 'string',
    enum: ['VALID', 'USED', 'CANCELLED'],
  },
  manualCode: {
    type: 'string',
    nullable: true,
    pattern: '^[2-9A-HJKMNP-Z]{4}(?:-[2-9A-HJKMNP-Z]{4}){3}$',
    description:
      'Código de acesso. É null quando o ingresso foi cancelado.',
  },
  issuedAt: dateTimeSchema,
  session: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'movie',
      'startsAt',
      'venueName',
      'roomName',
      'address',
    ],
    properties: {
      id: uuidSchema,
      movie: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'overview', 'posterPath', 'backdropPath'],
        properties: {
          title: { type: 'string' },
          overview: { type: 'string' },
          posterPath: nullableTextSchema,
          backdropPath: nullableTextSchema,
        },
      },
      startsAt: dateTimeSchema,
      venueName: { type: 'string' },
      roomName: { type: 'string' },
      address: { type: 'string' },
    },
  },
  seat: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'label', 'rowLabel', 'number'],
    properties: {
      id: uuidSchema,
      label: { type: 'string' },
      rowLabel: { type: 'string' },
      number: { type: 'integer', minimum: 1 },
    },
  },
}

const ownedTicketProperties: SchemaProperties = {
  ...ticketSummaryProperties,
  canCancel: {
    type: 'boolean',
    description:
      'Indica se este ingresso pode ser cancelado individualmente agora.',
  },
  reservation: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'status', 'ticketCount', 'canCancel'],
    properties: {
      id: uuidSchema,
      status: {
        type: 'string',
        enum: ['PAID', 'CANCELLED'],
      },
      ticketCount: { type: 'integer', minimum: 1 },
      canCancel: { type: 'boolean' },
    },
    oneOf: [
      {
        type: 'object',
        required: ['status', 'canCancel'],
        properties: {
          status: { type: 'string', enum: ['PAID'] },
          canCancel: { type: 'boolean' },
        },
      },
      {
        type: 'object',
        required: ['status', 'canCancel'],
        properties: {
          status: { type: 'string', enum: ['CANCELLED'] },
          canCancel: { type: 'boolean', enum: [false] },
        },
      },
    ],
  },
}

const schemaDefinitions = {
  ErrorResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['error', 'message'],
    properties: {
      error: {
        type: 'string',
        enum: [
          'VALIDATION_ERROR',
          'INVALID_CREDENTIALS',
          'UNAUTHORIZED',
          'FORBIDDEN',
          'NOT_FOUND',
          'CONFLICT',
          'TMDB_NOT_CONFIGURED',
          'TMDB_TIMEOUT',
          'TMDB_UPSTREAM_ERROR',
          'MOVIE_NOT_FOUND',
          'SESSION_NOT_FOUND',
          'SESSION_NOT_EDITABLE',
          'SESSION_LAYOUT_NOT_EDITABLE',
          'SESSION_ALREADY_PUBLISHED',
          'SESSION_NOT_PUBLISHABLE',
          'SEAT_UNAVAILABLE',
          'RESERVATION_EXPIRED',
          'SESSION_NOT_AVAILABLE',
          'RESERVATION_NOT_FOUND',
          'PAYMENT_ALREADY_PROCESSED',
          'PAYMENT_NOT_AVAILABLE',
          'RESERVATION_ALREADY_CANCELLED',
          'RESERVATION_NOT_CANCELLABLE',
          'RESERVATION_SESSION_STARTED',
          'RESERVATION_HAS_USED_TICKET',
          'TICKET_NOT_FOUND',
          'TICKET_NOT_SHAREABLE',
          'TICKET_NOT_CANCELLABLE',
          'TICKET_SESSION_STARTED',
          'SHARED_TICKET_NOT_FOUND',
          'SHARED_LINK_EXPIRED',
          'SHARED_LINK_REVOKED',
          'INTERNAL_ERROR',
        ],
      },
      message: { type: 'string' },
    },
  },
  Role: {
    type: 'string',
    enum: ['ORGANIZER', 'CUSTOMER', 'GATE'],
  },
  User: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'name', 'email', 'role'],
    properties: {
      id: uuidSchema,
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      role: { $ref: '#/components/schemas/Role' },
    },
  },
  LoginResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['accessToken', 'user'],
    properties: {
      accessToken: {
        type: 'string',
        description:
          'Token JWT usado como Bearer token nos endpoints autenticados.',
      },
      user: { $ref: '#/components/schemas/User' },
    },
  },
  CatalogMovie: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'title',
      'overview',
      'posterPath',
      'backdropPath',
      'releaseDate',
    ],
    properties: catalogMovieProperties,
  },
  CatalogMovieDetails: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'title',
      'overview',
      'posterPath',
      'backdropPath',
      'releaseDate',
      'runtimeMinutes',
    ],
    properties: {
      ...catalogMovieProperties,
      runtimeMinutes: {
        type: 'integer',
        minimum: 1,
        nullable: true,
      },
    },
  },
  CatalogMoviesResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['movies'],
    properties: {
      movies: {
        type: 'array',
        items: { $ref: '#/components/schemas/CatalogMovie' },
      },
    },
  },
  OrganizerSession: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'status',
      'startsAt',
      'venueName',
      'roomName',
      'address',
      'priceCents',
      'publishedAt',
      'createdAt',
      'updatedAt',
      'movie',
      'capacity',
      'rows',
      'seatsPerRow',
      'editability',
      'metrics',
    ],
    properties: {
      id: uuidSchema,
      status: {
        type: 'string',
        enum: ['DRAFT', 'PUBLISHED'],
      },
      startsAt: dateTimeSchema,
      venueName: { type: 'string' },
      roomName: { type: 'string' },
      address: { type: 'string' },
      priceCents: { type: 'integer', minimum: 0 },
      publishedAt: nullableDateTimeSchema,
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema,
      movie: {
        type: 'object',
        additionalProperties: false,
        required: [
          'tmdbId',
          'title',
          'overview',
          'posterPath',
          'backdropPath',
          'releaseDate',
          'runtimeMinutes',
        ],
        properties: {
          tmdbId: { type: 'integer', minimum: 1 },
          title: { type: 'string' },
          overview: { type: 'string' },
          posterPath: nullableTextSchema,
          backdropPath: nullableTextSchema,
          releaseDate: nullableDateSchema,
          runtimeMinutes: {
            type: 'integer',
            minimum: 1,
            nullable: true,
          },
        },
      },
      capacity: { type: 'integer', minimum: 0 },
      rows: { type: 'integer', minimum: 0 },
      seatsPerRow: { type: 'integer', minimum: 0 },
      editability: {
        type: 'object',
        additionalProperties: false,
        required: ['allowed', 'reason', 'layoutEditable'],
        description:
          'Política de edição estrutural derivada pelo backend com o relógio do PostgreSQL. O frontend apenas apresenta o resultado; a autorização real é sempre revalidada sob lock na própria edição.',
        properties: {
          allowed: { type: 'boolean' },
          reason: {
            type: 'string',
            enum: [
              'DRAFT',
              'PUBLISHED_SAFE',
              'SESSION_STARTED',
              'ACTIVE_HOLD',
              'COMMERCIAL_HISTORY',
            ],
            description:
              'DRAFT e PUBLISHED_SAFE permitem edição. SESSION_STARTED, ACTIVE_HOLD e COMMERCIAL_HISTORY a bloqueiam.',
          },
          layoutEditable: {
            type: 'boolean',
            description:
              'Falso quando existe qualquer alocação histórica de assento: o mapa não pode ser reconstruído sem apagar histórico, mesmo que os demais campos continuem editáveis.',
          },
        },
      },
      metrics: {
        type: 'object',
        additionalProperties: false,
        required: [
          'capacity',
          'availableSeats',
          'heldSeats',
          'soldSeats',
          'occupancyPercentage',
          'simulatedRevenueCents',
        ],
        description:
          'Métricas operacionais calculadas pelo backend em uma consulta agregada, sem nenhum dado pessoal.',
        properties: {
          capacity: {
            type: 'integer',
            minimum: 0,
            description: 'Total de assentos da sessão.',
          },
          availableSeats: { type: 'integer', minimum: 0 },
          heldSeats: {
            type: 'integer',
            minimum: 0,
            description:
              'Alocações ativas de reservas PENDING ainda dentro do prazo, medido pelo relógio do PostgreSQL.',
          },
          soldSeats: {
            type: 'integer',
            minimum: 0,
            description:
              'Alocações ainda ativas de reservas PAID. Um assento cancelado individualmente deixa de contar.',
          },
          occupancyPercentage: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description:
              'soldSeats / capacity, com uma casa decimal. Vale 0 quando a sessão não tem assentos.',
          },
          simulatedRevenueCents: {
            type: 'integer',
            minimum: 0,
            description:
              'Receita operacional simulada vigente: soma de unitPriceCents apenas das alocações contadas em soldSeats. Não é o histórico financeiro bruto — o Payment APPROVED original permanece inalterado após um cancelamento.',
          },
        },
      },
    },
  },
  OrganizerSessionsResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['sessions'],
    properties: {
      sessions: {
        type: 'array',
        items: { $ref: '#/components/schemas/OrganizerSession' },
      },
    },
  },
  PublicSessionSummary: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'startsAt',
      'venueName',
      'roomName',
      'priceCents',
      'movie',
      'capacity',
    ],
    properties: {
      id: uuidSchema,
      startsAt: dateTimeSchema,
      venueName: { type: 'string' },
      roomName: { type: 'string' },
      priceCents: { type: 'integer', minimum: 0 },
      movie: {
        type: 'object',
        additionalProperties: false,
        required: [
          'tmdbId',
          'title',
          'posterPath',
          'backdropPath',
          'releaseDate',
          'runtimeMinutes',
        ],
        properties: {
          tmdbId: { type: 'integer', minimum: 1 },
          title: { type: 'string' },
          posterPath: nullableTextSchema,
          backdropPath: nullableTextSchema,
          releaseDate: nullableDateSchema,
          runtimeMinutes: {
            type: 'integer',
            minimum: 1,
            nullable: true,
          },
        },
      },
      capacity: { type: 'integer', minimum: 0 },
    },
  },
  PublicSessionsResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['sessions'],
    properties: {
      sessions: {
        type: 'array',
        items: { $ref: '#/components/schemas/PublicSessionSummary' },
      },
    },
  },
  PublicSessionDetail: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'startsAt',
      'venueName',
      'roomName',
      'address',
      'priceCents',
      'movie',
      'capacity',
    ],
    properties: {
      id: uuidSchema,
      startsAt: dateTimeSchema,
      venueName: { type: 'string' },
      roomName: { type: 'string' },
      address: { type: 'string' },
      priceCents: { type: 'integer', minimum: 0 },
      movie: {
        type: 'object',
        additionalProperties: false,
        required: [
          'tmdbId',
          'title',
          'overview',
          'posterPath',
          'backdropPath',
          'releaseDate',
          'runtimeMinutes',
        ],
        properties: {
          tmdbId: { type: 'integer', minimum: 1 },
          title: { type: 'string' },
          overview: { type: 'string' },
          posterPath: nullableTextSchema,
          backdropPath: nullableTextSchema,
          releaseDate: nullableDateSchema,
          runtimeMinutes: {
            type: 'integer',
            minimum: 1,
            nullable: true,
          },
        },
      },
      capacity: { type: 'integer', minimum: 0 },
    },
  },
  SeatAvailability: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'label', 'rowLabel', 'number', 'status'],
    properties: {
      id: uuidSchema,
      label: { type: 'string' },
      rowLabel: { type: 'string' },
      number: { type: 'integer', minimum: 1 },
      status: {
        type: 'string',
        enum: ['AVAILABLE', 'HELD', 'SOLD'],
      },
    },
  },
  SeatAvailabilityResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['sessionId', 'seats'],
    properties: {
      sessionId: uuidSchema,
      seats: {
        type: 'array',
        items: { $ref: '#/components/schemas/SeatAvailability' },
      },
    },
  },
  Reservation: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'status',
      'expiresAt',
      'totalCents',
      'createdAt',
      'session',
      'seats',
    ],
    properties: {
      id: uuidSchema,
      status: {
        type: 'string',
        enum: ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED'],
      },
      expiresAt: dateTimeSchema,
      totalCents: { type: 'integer', minimum: 0 },
      createdAt: dateTimeSchema,
      session: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'movie',
          'startsAt',
          'venueName',
          'roomName',
          'address',
        ],
        properties: {
          id: uuidSchema,
          movie: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'posterPath'],
            properties: {
              title: { type: 'string' },
              posterPath: nullableTextSchema,
            },
          },
          startsAt: dateTimeSchema,
          venueName: { type: 'string' },
          roomName: { type: 'string' },
          address: { type: 'string' },
        },
      },
      seats: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'label',
            'rowLabel',
            'number',
            'unitPriceCents',
          ],
          properties: {
            id: uuidSchema,
            label: { type: 'string' },
            rowLabel: { type: 'string' },
            number: { type: 'integer', minimum: 1 },
            unitPriceCents: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
  },
  PaymentResult: {
    type: 'object',
    additionalProperties: false,
    required: ['payment', 'reservation', 'tickets'],
    properties: {
      payment: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status', 'amountCents', 'createdAt'],
        properties: {
          id: uuidSchema,
          status: {
            type: 'string',
            enum: ['APPROVED', 'DECLINED'],
          },
          amountCents: { type: 'integer', minimum: 0 },
          createdAt: dateTimeSchema,
        },
      },
      reservation: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status'],
        properties: {
          id: uuidSchema,
          status: {
            type: 'string',
            enum: ['PAID', 'CANCELLED'],
          },
        },
      },
      tickets: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: {
            id: uuidSchema,
          },
        },
      },
    },
  },
  ReservationCancellationResult: {
    type: 'object',
    additionalProperties: false,
    required: ['reservation', 'tickets'],
    properties: {
      reservation: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status'],
        properties: {
          id: uuidSchema,
          status: { type: 'string', enum: ['CANCELLED'] },
        },
      },
      tickets: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'status'],
          properties: {
            id: uuidSchema,
            status: { type: 'string', enum: ['CANCELLED'] },
          },
        },
      },
    },
  },
  TicketCancellationResult: {
    type: 'object',
    additionalProperties: false,
    required: ['ticket', 'reservation'],
    properties: {
      ticket: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status'],
        properties: {
          id: uuidSchema,
          status: { type: 'string', enum: ['CANCELLED'] },
        },
      },
      reservation: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status'],
        properties: {
          id: uuidSchema,
          status: { type: 'string', enum: ['PAID', 'CANCELLED'] },
        },
      },
    },
  },
  TicketSummary: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'status',
      'manualCode',
      'issuedAt',
      'session',
      'seat',
      'canCancel',
      'reservation',
    ],
    properties: ownedTicketProperties,
    oneOf: [
      {
        type: 'object',
        required: ['status', 'manualCode'],
        properties: {
          status: { type: 'string', enum: ['VALID', 'USED'] },
          manualCode: {
            type: 'string',
            pattern: '^[2-9A-HJKMNP-Z]{4}(?:-[2-9A-HJKMNP-Z]{4}){3}$',
          },
        },
      },
      {
        type: 'object',
        required: ['status', 'manualCode'],
        properties: {
          status: { type: 'string', enum: ['CANCELLED'] },
          manualCode: { type: 'string', nullable: true, enum: [null] },
        },
      },
    ],
  } as SchemaObject,
  TicketListResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['tickets'],
    properties: {
      tickets: {
        type: 'array',
        items: { $ref: '#/components/schemas/TicketSummary' },
      },
    },
  },
  TicketDetail: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'status',
      'manualCode',
      'issuedAt',
      'session',
      'seat',
      'canCancel',
      'reservation',
      'shareLink',
      'qrToken',
    ],
    properties: {
      ...ownedTicketProperties,
      shareLink: {
        type: 'object',
        nullable: true,
        additionalProperties: false,
        required: ['expiresAt'],
        properties: {
          expiresAt: dateTimeSchema,
        },
      },
      qrToken: {
        type: 'string',
        nullable: true,
        description:
          'Credencial assinada codificada no QR. É null quando o ingresso foi cancelado.',
      },
    },
    oneOf: [
      {
        type: 'object',
        required: ['status', 'manualCode', 'qrToken'],
        properties: {
          status: { type: 'string', enum: ['VALID', 'USED'] },
          manualCode: {
            type: 'string',
            pattern: '^[2-9A-HJKMNP-Z]{4}(?:-[2-9A-HJKMNP-Z]{4}){3}$',
          },
          qrToken: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['status', 'manualCode', 'qrToken'],
        properties: {
          status: { type: 'string', enum: ['CANCELLED'] },
          manualCode: { type: 'string', nullable: true, enum: [null] },
          qrToken: { type: 'string', nullable: true, enum: [null] },
        },
      },
    ],
  } as SchemaObject,
  SharedTicket: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'status',
      'manualCode',
      'issuedAt',
      'session',
      'seat',
      'qrToken',
    ],
    properties: {
      ...ticketSummaryProperties,
      qrToken: {
        type: 'string',
        nullable: true,
        description:
          'Credencial assinada codificada no QR. É null quando o ingresso foi cancelado.',
      },
    },
    oneOf: [
      {
        type: 'object',
        required: ['status', 'manualCode', 'qrToken'],
        properties: {
          status: { type: 'string', enum: ['VALID', 'USED'] },
          manualCode: {
            type: 'string',
            pattern: '^[2-9A-HJKMNP-Z]{4}(?:-[2-9A-HJKMNP-Z]{4}){3}$',
          },
          qrToken: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['status', 'manualCode', 'qrToken'],
        properties: {
          status: { type: 'string', enum: ['CANCELLED'] },
          manualCode: { type: 'string', nullable: true, enum: [null] },
          qrToken: { type: 'string', nullable: true, enum: [null] },
        },
      },
    ],
  } as SchemaObject,
  ShareLink: {
    type: 'object',
    additionalProperties: false,
    required: ['url', 'expiresAt'],
    properties: {
      url: { type: 'string', format: 'uri' },
      expiresAt: dateTimeSchema,
    },
  },
  GateSession: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'startsAt', 'venueName', 'roomName', 'movie'],
    properties: {
      id: uuidSchema,
      startsAt: dateTimeSchema,
      venueName: { type: 'string' },
      roomName: { type: 'string' },
      movie: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'posterPath'],
        properties: {
          title: { type: 'string' },
          posterPath: nullableTextSchema,
        },
      },
    },
  },
  GateSessionsResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['sessions'],
    properties: {
      sessions: {
        type: 'array',
        items: { $ref: '#/components/schemas/GateSession' },
      },
    },
  },
  GateConsumeResult: {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['result'],
        properties: {
          result: { type: 'string', enum: ['INVALID'] },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['result'],
        properties: {
          result: { type: 'string', enum: ['WRONG_EVENT'] },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['result', 'usedAt'],
        properties: {
          result: { type: 'string', enum: ['ALREADY_USED'] },
          usedAt: nullableDateTimeSchema,
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['result', 'usedAt', 'ticket'],
        properties: {
          result: { type: 'string', enum: ['VALID'] },
          usedAt: dateTimeSchema,
          ticket: {
            type: 'object',
            additionalProperties: false,
            required: ['seat', 'session'],
            properties: {
              seat: {
                type: 'object',
                additionalProperties: false,
                required: ['label'],
                properties: {
                  label: { type: 'string' },
                },
              },
              session: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'id',
                  'startsAt',
                  'venueName',
                  'roomName',
                  'movie',
                ],
                properties: {
                  id: uuidSchema,
                  startsAt: dateTimeSchema,
                  venueName: { type: 'string' },
                  roomName: { type: 'string' },
                  movie: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['title'],
                    properties: {
                      title: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
  HealthResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['ok'] },
    },
  },
} satisfies Record<string, SchemaObject>

export type OpenApiSchemaName = keyof typeof schemaDefinitions

export const openApiSchemas = schemaDefinitions

export function schemaRef(name: OpenApiSchemaName) {
  return { $ref: `#/components/schemas/${name}` } as const
}

/**
 * Uma stream SSE não tem corpo JSON: ela é um texto infinito de eventos.
 * Documentamos o media type real em vez de inventar um envelope de resposta.
 */
export function eventStreamResponse(description: string) {
  return {
    description,
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          description:
            'Fluxo de eventos SSE. Cada bloco usa `event: <nome>` e `data: {"sessionId":"<uuid>"}`. Eventos: `sync` na abertura, `seats-changed` a cada mudança de disponibilidade e `session-changed` quando os dados estruturais da sessão são editados. Comentários `: keep-alive` mantêm a conexão viva.',
        },
      },
    },
  } as const
}

export function documentedResponse(
  name: OpenApiSchemaName,
  description: string,
) {
  return {
    description,
    content: {
      'application/json': {
        schema: schemaRef(name),
      },
    },
  } as const
}
