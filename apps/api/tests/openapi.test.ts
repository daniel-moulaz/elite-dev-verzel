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
  '/organizer/sessions/{id}/publish',
  '/sessions',
  '/sessions/{id}',
  '/sessions/{id}/seats',
  '/reservations',
  '/reservations/{id}',
  '/reservations/{id}/payment',
  '/me/tickets',
  '/me/tickets/{id}',
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
    expect(paths).toHaveLength(20)
    expect(paths).toEqual(expect.arrayContaining([...EXPECTED_PATHS]))
    expect(listOperations(document)).toHaveLength(23)
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
      ['/organizer/sessions', 'get', 'Organizer'],
      ['/reservations', 'post', 'Reservations'],
      ['/reservations/{id}/payment', 'post', 'Payments'],
      ['/me/tickets', 'get', 'Tickets'],
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

    const authenticatedUser = getOperation(document, '/auth/me', 'get')
    expectBearerSecurity(authenticatedUser)

    const roleOperations = [
      ['/organizer/sessions', 'post', 'ORGANIZER'],
      ['/reservations', 'post', 'CUSTOMER'],
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
