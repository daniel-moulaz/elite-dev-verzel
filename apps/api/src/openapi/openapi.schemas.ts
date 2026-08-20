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
    enum: ['VALID', 'USED'],
  },
  manualCode: {
    type: 'string',
    pattern: '^[2-9A-HJKMNP-Z]{4}(?:-[2-9A-HJKMNP-Z]{4}){3}$',
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
          'SESSION_ALREADY_PUBLISHED',
          'SESSION_NOT_PUBLISHABLE',
          'SEAT_UNAVAILABLE',
          'RESERVATION_EXPIRED',
          'SESSION_NOT_AVAILABLE',
          'RESERVATION_NOT_FOUND',
          'PAYMENT_ALREADY_PROCESSED',
          'PAYMENT_NOT_AVAILABLE',
          'TICKET_NOT_FOUND',
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
  TicketSummary: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'status', 'manualCode', 'issuedAt', 'session', 'seat'],
    properties: ticketSummaryProperties,
  },
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
      'shareLink',
      'qrToken',
    ],
    properties: {
      ...ticketSummaryProperties,
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
        description: 'Credencial assinada codificada no QR do ingresso.',
      },
    },
  },
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
        description: 'Credencial assinada codificada no QR do ingresso.',
      },
    },
  },
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
