import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

type JsonObject = Record<string, unknown>

const HTTP_METHODS = new Set([
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
])

const EXPECTED_PATHS = [
  '/health',
  '/auth/login',
  '/auth/me',
  '/catalog/movies',
  '/catalog/movies/{tmdbId}',
  '/organizer/sessions',
  '/organizer/sessions/{id}',
  '/organizer/sessions/{id}/duplicate',
  '/organizer/sessions/{id}/publish',
  '/sessions',
  '/sessions/{id}',
  '/sessions/{id}/seats',
  '/sessions/{id}/events',
  '/reservations',
  '/reservations/{id}',
  '/reservations/{id}/cancel',
  '/reservations/{id}/payment',
  '/me/tickets',
  '/me/tickets/{id}',
  '/me/tickets/{id}/cancel',
  '/me/tickets/{id}/share-link',
  '/shared/{token}',
  '/gate/sessions',
  '/gate/tickets/consume',
] as const

const EXPECTED_TAGS = [
  'Health',
  'Auth',
  'Catalog',
  'Sessions',
  'Organizer',
  'Reservations',
  'Payments',
  'Tickets',
  'Sharing',
  'Gate',
] as const

const appsToClose: ReturnType<typeof buildApp>[] = []

afterEach(async () => {
  await Promise.all(appsToClose.splice(0).map((app) => app.close()))
})

function createApp() {
  const app = buildApp()
  appsToClose.push(app)
  return app
}

function asObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} não é um objeto JSON.`)
  }

  return value as JsonObject
}

function asObjectArray(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} não é uma lista JSON.`)
  }

  return value.map((item, index) => asObject(item, `${label}[${index}]`))
}

function getPaths(document: JsonObject) {
  return asObject(document.paths, 'paths')
}

function normalizePath(path: string) {
  return path === '/' ? path : path.replace(/\/$/u, '')
}

function getOperation(
  document: JsonObject,
  path: string,
  method: string,
) {
  const paths = getPaths(document)
  const matchingPath = Object.keys(paths).find(
    (documentedPath) => normalizePath(documentedPath) === normalizePath(path),
  )
  const pathItem = asObject(
    matchingPath ? paths[matchingPath] : undefined,
    `paths.${path}`,
  )
  return asObject(pathItem[method], `paths.${path}.${method}`)
}

function listOperations(document: JsonObject) {
  return Object.entries(getPaths(document)).flatMap(([path, pathValue]) =>
    Object.entries(asObject(pathValue, `paths.${path}`))
      .filter(([method]) => HTTP_METHODS.has(method))
      .map(([method, operation]) => ({
        method,
        operation: asObject(operation, `paths.${path}.${method}`),
        path,
      })),
  )
}

function resolveLocalReference(
  document: JsonObject,
  value: unknown,
  visited = new Set<string>(),
): JsonObject {
  const schema = asObject(value, 'schema')
  const reference = schema.$ref

  if (typeof reference !== 'string') {
    return schema
  }

  if (!reference.startsWith('#/') || visited.has(reference)) {
    throw new Error(`Referência OpenAPI local inválida: ${reference}`)
  }

  visited.add(reference)
  const referencedValue = reference
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((current, segment) => {
      return asObject(current, reference)[segment]
    }, document)

  return resolveLocalReference(document, referencedValue, visited)
}

function getJsonContentSchema(container: JsonObject, label: string) {
  const content = asObject(container.content, `${label}.content`)
  const jsonContent = asObject(
    content['application/json'],
    `${label}.content.application/json`,
  )
  return asObject(jsonContent.schema, `${label}.content.application/json.schema`)
}

function getResponseSchema(
  operation: JsonObject,
  statusCode: string,
) {
  const responses = asObject(operation.responses, 'operation.responses')
  const response = asObject(
    responses[statusCode],
    `operation.responses.${statusCode}`,
  )
  return getJsonContentSchema(response, `operation.responses.${statusCode}`)
}

function findPropertySchema(
  document: JsonObject,
  inputSchema: unknown,
  propertyName: string,
  visited = new Set<JsonObject>(),
): JsonObject | undefined {
  const schema = resolveLocalReference(document, inputSchema)

  if (visited.has(schema)) {
    return undefined
  }

  visited.add(schema)
  const properties = schema.properties

  if (properties !== undefined) {
    const property = asObject(properties, 'schema.properties')[propertyName]

    if (property !== undefined) {
      return resolveLocalReference(document, property)
    }
  }

  for (const composition of ['allOf', 'anyOf'] as const) {
    const candidates = schema[composition]

    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        const property = findPropertySchema(
          document,
          candidate,
          propertyName,
          visited,
        )

        if (property) {
          return property
        }
      }
    }
  }

  return undefined
}

function getSingleAllowedString(schema: JsonObject) {
  if (typeof schema.const === 'string') {
    return schema.const
  }

  if (
    Array.isArray(schema.enum) &&
    schema.enum.length === 1 &&
    typeof schema.enum[0] === 'string'
  ) {
    return schema.enum[0]
  }

  throw new Error('A variante não possui um único valor discriminador.')
}

function findVariantByStatus(
  document: JsonObject,
  inputSchema: unknown,
  status: string,
) {
  const schema = resolveLocalReference(document, inputSchema)
  const variants = asObjectArray(schema.oneOf, 'schema.oneOf')

  return variants.find((variant) => {
    const statusSchema = findPropertySchema(document, variant, 'status')
    return Array.isArray(statusSchema?.enum) && statusSchema.enum.includes(status)
  })
}

function expectBearerSecurity(operation: JsonObject) {
  expect(operation.security).toEqual(
    expect.arrayContaining([{ bearerAuth: [] }]),
  )
}

function expectRoleDocumented(operation: JsonObject, role: string) {
  const operationText = [operation.summary, operation.description]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')

  expect(operationText).toMatch(new RegExp(`\\b${role}\\b`, 'u'))
}

describe('OpenAPI documentation', () => {
  it('serves the Swagger UI and a complete API inventory', async () => {
    const app = createApp()

    const [uiResponse, documentResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/docs/' }),
      app.inject({ method: 'GET', url: '/docs/json' }),
    ])

    expect(uiResponse.statusCode).toBe(200)
    expect(uiResponse.headers['content-type']).toContain('text/html')
    expect(uiResponse.body).toMatch(/swagger ui/iu)

    expect(documentResponse.statusCode).toBe(200)
    expect(documentResponse.headers['content-type']).toContain(
      'application/json',
    )

    const document = asObject(documentResponse.json(), 'document')
    const info = asObject(document.info, 'info')
    const paths = Object.keys(getPaths(document)).map(normalizePath)

    expect(document.openapi).toBe('3.0.3')
    expect(info).toMatchObject({
      title: 'SEPTEM API',
      description:
        'API da plataforma de sessões e ingressos de cinema SEPTEM.',
      version: '0.1.0',
    })
    expect(paths).toHaveLength(24)
    expect(paths).toEqual(expect.arrayContaining([...EXPECTED_PATHS]))
    expect(listOperations(document)).toHaveLength(27)
  })

  it('documents tags, bearer authentication and role requirements', async () => {
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = asObject(response.json(), 'document')
    const components = asObject(document.components, 'components')
    const securitySchemes = asObject(
      components.securitySchemes,
      'components.securitySchemes',
    )
    const bearerAuth = asObject(
      securitySchemes.bearerAuth,
      'components.securitySchemes.bearerAuth',
    )

    expect(bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })

    const declaredTags = asObjectArray(document.tags, 'tags').map((tag) =>
      String(tag.name),
    )
    const usedTags = new Set(
      listOperations(document).flatMap(({ operation }) =>
        Array.isArray(operation.tags)
          ? operation.tags.filter(
              (tag): tag is string => typeof tag === 'string',
            )
          : [],
      ),
    )

    expect(declaredTags).toHaveLength(EXPECTED_TAGS.length)
    expect(declaredTags).toEqual(expect.arrayContaining([...EXPECTED_TAGS]))

    const representativeOperations = [
      ['/health', 'get', 'Health'],
      ['/auth/login', 'post', 'Auth'],
      ['/catalog/movies', 'get', 'Catalog'],
      ['/sessions', 'get', 'Sessions'],
      ['/sessions/{id}/events', 'get', 'Sessions'],
      ['/organizer/sessions', 'get', 'Organizer'],
      ['/reservations', 'post', 'Reservations'],
      ['/reservations/{id}/cancel', 'post', 'Reservations'],
      ['/reservations/{id}/payment', 'post', 'Payments'],
      ['/me/tickets', 'get', 'Tickets'],
      ['/me/tickets/{id}/cancel', 'post', 'Tickets'],
      ['/me/tickets/{id}/share-link', 'post', 'Sharing'],
      ['/gate/sessions', 'get', 'Gate'],
    ] as const

    for (const [path, method, tag] of representativeOperations) {
      expect(getOperation(document, path, method).tags).toContain(tag)
      expect(usedTags).toContain(tag)
    }

    const login = getOperation(document, '/auth/login', 'post')
    const loginBody = asObject(login.requestBody, 'login.requestBody')
    const loginBodySchema = resolveLocalReference(
      document,
      getJsonContentSchema(loginBody, 'login.requestBody'),
    )

    expect(login.security ?? []).toEqual([])
    expect(loginBody.required).toBe(true)
    expect(loginBodySchema.required).toEqual(
      expect.arrayContaining(['email', 'password']),
    )
    expect(findPropertySchema(document, loginBodySchema, 'email')).toMatchObject(
      {
        type: 'string',
        format: 'email',
      },
    )
    expect(
      findPropertySchema(document, loginBodySchema, 'password'),
    ).toBeDefined()

    // O limite de tentativas faz parte do contrato: um cliente precisa saber
    // que 429 é possível aqui, e não apenas 401.
    expect(Object.keys(asObject(login.responses, 'login.responses'))).toEqual(
      expect.arrayContaining(['200', '400', '401', '429']),
    )

    const authenticatedUser = getOperation(document, '/auth/me', 'get')
    expectBearerSecurity(authenticatedUser)

    const roleOperations = [
      ['/organizer/sessions', 'post', 'ORGANIZER'],
      ['/organizer/sessions/{id}/duplicate', 'post', 'ORGANIZER'],
      ['/reservations', 'post', 'CUSTOMER'],
      ['/reservations/{id}/cancel', 'post', 'CUSTOMER'],
      ['/me/tickets/{id}/cancel', 'post', 'CUSTOMER'],
      ['/gate/tickets/consume', 'post', 'GATE'],
    ] as const

    for (const [path, method, role] of roleOperations) {
      const operation = getOperation(document, path, method)
      expectBearerSecurity(operation)
      expectRoleDocumented(operation, role)
    }
  })

  it('describes critical response variants without leaking sensitive data', async () => {
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = asObject(response.json(), 'document')

    const listSessions = getOperation(document, '/sessions', 'get')
    const listSessionsResponse = resolveLocalReference(
      document,
      getResponseSchema(listSessions, '200'),
    )
    const sessionsProperty = findPropertySchema(
      document,
      listSessionsResponse,
      'sessions',
    )

    if (!sessionsProperty) {
      throw new Error('Resposta pública sem a lista de sessões documentada.')
    }

    const sessionItem = resolveLocalReference(
      document,
      sessionsProperty.items,
    )
    const movieProperty = findPropertySchema(document, sessionItem, 'movie')

    if (!movieProperty) {
      throw new Error('Resumo público sem snapshot de filme documentado.')
    }

    expect(findPropertySchema(document, movieProperty, 'tmdbId')).toMatchObject(
      { type: 'integer', minimum: 1 },
    )
    expect(
      findPropertySchema(document, movieProperty, 'backdropPath'),
    ).toMatchObject({ type: 'string', nullable: true })
    expect(
      findPropertySchema(document, movieProperty, 'runtimeMinutes'),
    ).toMatchObject({ type: 'integer', minimum: 1, nullable: true })

    const consumeTicket = getOperation(
      document,
      '/gate/tickets/consume',
      'post',
    )
    const consumeResponse = resolveLocalReference(
      document,
      getResponseSchema(consumeTicket, '200'),
    )
    const variants = asObjectArray(
      consumeResponse.oneOf,
      'gate consume response oneOf',
    )
    const documentedResults = variants.map((variant) => {
      const resultSchema = findPropertySchema(document, variant, 'result')

      if (!resultSchema) {
        throw new Error('Variante do Gate sem propriedade result.')
      }

      return getSingleAllowedString(resultSchema)
    })

    expect(variants).toHaveLength(4)
    expect(documentedResults.sort()).toEqual(
      ['VALID', 'ALREADY_USED', 'WRONG_EVENT', 'INVALID'].sort(),
    )

    const deleteShareLink = getOperation(
      document,
      '/me/tickets/{id}/share-link',
      'delete',
    )
    const shareResponses = asObject(
      deleteShareLink.responses,
      'delete share responses',
    )
    expect(shareResponses).toHaveProperty('204')

    const organizerSchemas = asObject(
      asObject(document.components, 'components').schemas,
      'components.schemas',
    )
    const organizerSession = resolveLocalReference(
      document,
      organizerSchemas.OrganizerSession,
    )
    const editability = findPropertySchema(
      document,
      organizerSession,
      'editability',
    )
    const sessionMetrics = findPropertySchema(
      document,
      organizerSession,
      'metrics',
    )

    expect(
      findPropertySchema(document, editability, 'reason')?.enum,
    ).toEqual([
      'DRAFT',
      'PUBLISHED_SAFE',
      'SESSION_STARTED',
      'ACTIVE_HOLD',
      'COMMERCIAL_HISTORY',
    ])
    expect(
      findPropertySchema(document, editability, 'allowed'),
    ).toMatchObject({ type: 'boolean' })
    expect(
      findPropertySchema(document, editability, 'layoutEditable'),
    ).toMatchObject({ type: 'boolean' })
    expect(asObject(sessionMetrics, 'metrics').required).toEqual([
      'capacity',
      'availableSeats',
      'heldSeats',
      'soldSeats',
      'occupancyPercentage',
      'simulatedRevenueCents',
    ])
    expect(
      findPropertySchema(document, sessionMetrics, 'simulatedRevenueCents'),
    ).toMatchObject({ type: 'integer', minimum: 0 })
    expect(
      findPropertySchema(document, sessionMetrics, 'occupancyPercentage'),
    ).toMatchObject({ type: 'number', minimum: 0, maximum: 100 })

    const duplicateSession = getOperation(
      document,
      '/organizer/sessions/{id}/duplicate',
      'post',
    )
    expect(duplicateSession.operationId).toBe('duplicateOrganizerSession')
    expectBearerSecurity(duplicateSession)
    expect(
      asObject(duplicateSession.responses, 'duplicate responses'),
    ).toEqual(
      expect.objectContaining({
        201: expect.any(Object),
        400: expect.any(Object),
        401: expect.any(Object),
        403: expect.any(Object),
        404: expect.any(Object),
      }),
    )

    const sessionEvents = getOperation(
      document,
      '/sessions/{id}/events',
      'get',
    )
    const sessionEventsResponses = asObject(
      sessionEvents.responses,
      'session events responses',
    )
    const streamResponse = asObject(
      sessionEventsResponses['200'],
      'session events 200',
    )
    const streamContent = asObject(
      streamResponse.content,
      'session events 200 content',
    )

    expect(sessionEvents.operationId).toBe('streamPublicSessionEvents')
    // Endpoint público: o snapshot equivalente também não exige autenticação.
    expect(sessionEvents.security ?? []).toEqual([])
    // Uma stream infinita não pode ser documentada como um corpo JSON.
    expect(Object.keys(streamContent)).toEqual(['text/event-stream'])
    expect(streamContent).not.toHaveProperty('application/json')
    expect(
      asObject(streamContent['text/event-stream'], 'stream media type').schema,
    ).toMatchObject({ type: 'string' })
    expect(sessionEventsResponses).toEqual(
      expect.objectContaining({
        200: expect.any(Object),
        400: expect.any(Object),
        404: expect.any(Object),
      }),
    )

    const cancelReservation = getOperation(
      document,
      '/reservations/{id}/cancel',
      'post',
    )
    expect(cancelReservation.operationId).toBe('cancelReservation')
    expectBearerSecurity(cancelReservation)
    expect(asObject(cancelReservation.responses, 'cancel responses')).toEqual(
      expect.objectContaining({
        200: expect.any(Object),
        400: expect.any(Object),
        401: expect.any(Object),
        403: expect.any(Object),
        404: expect.any(Object),
        409: expect.any(Object),
      }),
    )
    const cancellationResult = resolveLocalReference(
      document,
      getResponseSchema(cancelReservation, '200'),
    )
    const cancelledReservation = findPropertySchema(
      document,
      cancellationResult,
      'reservation',
    )
    const cancelledTickets = findPropertySchema(
      document,
      cancellationResult,
      'tickets',
    )
    const cancelledReservationStatus = findPropertySchema(
      document,
      cancelledReservation,
      'status',
    )
    const cancelledTicketItems = resolveLocalReference(
      document,
      asObject(cancelledTickets, 'cancelled tickets').items,
    )
    const cancelledTicketStatus = findPropertySchema(
      document,
      cancelledTicketItems,
      'status',
    )

    expect(cancellationResult.required).toEqual(['reservation', 'tickets'])
    expect(cancelledReservationStatus?.enum).toEqual(['CANCELLED'])
    expect(cancelledTickets).toMatchObject({ type: 'array', minItems: 1 })
    expect(cancelledTicketStatus?.enum).toEqual(['CANCELLED'])

    const cancelTicket = getOperation(
      document,
      '/me/tickets/{id}/cancel',
      'post',
    )
    expect(cancelTicket.operationId).toBe('cancelCustomerTicket')
    expectBearerSecurity(cancelTicket)
    expect(asObject(cancelTicket.responses, 'cancel ticket responses')).toEqual(
      expect.objectContaining({
        200: expect.any(Object),
        400: expect.any(Object),
        401: expect.any(Object),
        403: expect.any(Object),
        404: expect.any(Object),
        409: expect.any(Object),
      }),
    )
    const ticketCancellationResult = resolveLocalReference(
      document,
      getResponseSchema(cancelTicket, '200'),
    )
    const cancelledTicketResult = findPropertySchema(
      document,
      ticketCancellationResult,
      'ticket',
    )
    const ticketResultReservation = findPropertySchema(
      document,
      ticketCancellationResult,
      'reservation',
    )
    const cancelledTicketResultStatus = findPropertySchema(
      document,
      cancelledTicketResult,
      'status',
    )
    const ticketResultReservationStatus = findPropertySchema(
      document,
      ticketResultReservation,
      'status',
    )

    expect(ticketCancellationResult.required).toEqual(['ticket', 'reservation'])
    expect(cancelledTicketResultStatus?.enum).toEqual(['CANCELLED'])
    expect(ticketResultReservationStatus?.enum).toEqual(['PAID', 'CANCELLED'])

    const components = asObject(document.components, 'components')
    const schemas = asObject(components.schemas, 'components.schemas')
    const ticketSummary = resolveLocalReference(
      document,
      schemas.TicketSummary,
    )
    const sharedTicket = resolveLocalReference(
      document,
      schemas.SharedTicket,
    )
    const ticketDetail = resolveLocalReference(
      document,
      schemas.TicketDetail,
    )
    const errorResponse = resolveLocalReference(
      document,
      schemas.ErrorResponse,
    )
    const ticketStatus = findPropertySchema(document, ticketSummary, 'status')
    const manualCode = findPropertySchema(
      document,
      ticketSummary,
      'manualCode',
    )
    const privateReservation = findPropertySchema(
      document,
      ticketSummary,
      'reservation',
    )
    const ticketCanCancel = findPropertySchema(
      document,
      ticketSummary,
      'canCancel',
    )
    const detailCanCancel = findPropertySchema(
      document,
      ticketDetail,
      'canCancel',
    )
    const sharedCanCancel = findPropertySchema(
      document,
      sharedTicket,
      'canCancel',
    )
    const sharedReservation = findPropertySchema(
      document,
      sharedTicket,
      'reservation',
    )
    const sharedManualCode = findPropertySchema(
      document,
      sharedTicket,
      'manualCode',
    )
    const sharedQrToken = findPropertySchema(
      document,
      sharedTicket,
      'qrToken',
    )
    const privateQrToken = findPropertySchema(
      document,
      ticketDetail,
      'qrToken',
    )
    const errorCode = findPropertySchema(
      document,
      errorResponse,
      'error',
    )
    const cancelledSummaryVariant = findVariantByStatus(
      document,
      ticketSummary,
      'CANCELLED',
    )
    const cancelledDetailVariant = findVariantByStatus(
      document,
      ticketDetail,
      'CANCELLED',
    )
    const cancelledSharedVariant = findVariantByStatus(
      document,
      sharedTicket,
      'CANCELLED',
    )
    const cancelledReservationVariant = findVariantByStatus(
      document,
      privateReservation,
      'CANCELLED',
    )

    expect(ticketStatus?.enum).toEqual(['VALID', 'USED', 'CANCELLED'])
    expect(manualCode).toMatchObject({ type: 'string', nullable: true })
    expect(privateReservation).toBeDefined()
    expect(sharedReservation).toBeUndefined()
    expect(ticketCanCancel).toMatchObject({ type: 'boolean' })
    expect(detailCanCancel).toMatchObject({ type: 'boolean' })
    expect(sharedCanCancel).toBeUndefined()
    expect(sharedManualCode).toMatchObject({ type: 'string', nullable: true })
    expect(sharedQrToken).toMatchObject({ type: 'string', nullable: true })
    expect(privateQrToken).toMatchObject({ type: 'string', nullable: true })
    expect(
      findPropertySchema(
        document,
        cancelledSummaryVariant,
        'manualCode',
      )?.enum,
    ).toEqual([null])
    expect(
      findPropertySchema(document, cancelledDetailVariant, 'qrToken')?.enum,
    ).toEqual([null])
    expect(
      findPropertySchema(document, cancelledSharedVariant, 'qrToken')?.enum,
    ).toEqual([null])
    expect(
      findPropertySchema(
        document,
        cancelledReservationVariant,
        'canCancel',
      )?.enum,
    ).toEqual([false])
    expect(errorCode?.enum).toEqual(
      expect.arrayContaining([
        'RESERVATION_ALREADY_CANCELLED',
        'RESERVATION_NOT_CANCELLABLE',
        'RESERVATION_SESSION_STARTED',
        'RESERVATION_HAS_USED_TICKET',
        'TICKET_NOT_SHAREABLE',
        'TICKET_NOT_CANCELLABLE',
        'TICKET_SESSION_STARTED',
        'SESSION_NOT_EDITABLE',
        'SESSION_LAYOUT_NOT_EDITABLE',
      ]),
    )

    const serializedDocument = JSON.stringify(document)
    expect(serializedDocument).not.toMatch(
      /password[_-]?hash|token[_-]?hash|jwt_secret|ticket_signing_secret|tmdb_read_access_token/iu,
    )
    expect(serializedDocument).not.toMatch(/@demo\.local/iu)

    const sensitiveEnvironmentValues = [
      process.env.JWT_SECRET,
      process.env.TICKET_SIGNING_SECRET,
      process.env.TMDB_READ_ACCESS_TOKEN,
    ].filter((value): value is string => Boolean(value))

    for (const sensitiveValue of sensitiveEnvironmentValues) {
      expect(serializedDocument).not.toContain(sensitiveValue)
    }
  })
})
