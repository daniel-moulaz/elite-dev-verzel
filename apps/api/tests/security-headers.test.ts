import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const appsToClose: ReturnType<typeof buildApp>[] = []

afterEach(async () => {
  await Promise.all(appsToClose.splice(0).map((app) => app.close()))
})

describe('cabeçalhos de segurança', () => {
  it('applies the baseline headers to success, error and not-found responses', async () => {
    const app = buildApp()
    appsToClose.push(app)

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/health' }),
      app.inject({ method: 'GET', url: '/sessions/nao-e-uuid' }),
      app.inject({ method: 'GET', url: '/rota-inexistente' }),
      app.inject({ method: 'GET', url: '/organizer/sessions' }),
    ])

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([
      200, 400, 404, 401,
    ])

    for (const response of responses) {
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['referrer-policy']).toBe('no-referrer')
      expect(response.headers['x-frame-options']).toBe('DENY')
    }
  })
})
