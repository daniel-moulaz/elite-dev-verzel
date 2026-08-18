import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const appsToClose: ReturnType<typeof buildApp>[] = []

afterEach(async () => {
  await Promise.all(appsToClose.splice(0).map((app) => app.close()))
})

describe('GET /health', () => {
  it('reports that the API is available', async () => {
    const app = buildApp()
    appsToClose.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})
