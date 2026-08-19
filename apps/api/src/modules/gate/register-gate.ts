import type { FastifyInstance } from 'fastify'
import { gateRoutes, type GateRoutesOptions } from './gate.routes.js'

export function registerGate(
  app: FastifyInstance,
  options: GateRoutesOptions,
) {
  app.register(gateRoutes, { prefix: '/gate', ...options })
}
