import { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../lib/prisma.js'

type QueryClient = Pick<Prisma.TransactionClient, '$queryRaw'>

export interface SessionMetrics {
  capacity: number
  availableSeats: number
  heldSeats: number
  soldSeats: number
  occupancyPercentage: number
  simulatedRevenueCents: number
}

interface SessionMetricsRow {
  sessionId: string
  capacity: number
  heldSeats: number
  soldSeats: number
  simulatedRevenueCents: number
}

function toMetrics(row: SessionMetricsRow): SessionMetrics {
  const capacity = row.capacity
  const heldSeats = row.heldSeats
  const soldSeats = row.soldSeats

  return {
    capacity,
    heldSeats,
    soldSeats,
    availableSeats: Math.max(0, capacity - heldSeats - soldSeats),
    // Sala sem assentos nunca divide por zero.
    occupancyPercentage:
      capacity === 0 ? 0 : Math.round((soldSeats / capacity) * 1_000) / 10,
    simulatedRevenueCents: row.simulatedRevenueCents,
  }
}

/**
 * Métricas operacionais de uma ou mais sessões, em uma única consulta.
 *
 * Cada agregado sai de uma subconsulta independente sobre `ReservationSeat`,
 * nunca de JOINs empilhados na mesma linha — é isso que impede a receita e as
 * contagens de serem multiplicadas por produto cartesiano.
 *
 * Definições:
 * - `heldSeats`: alocações ativas de reservas PENDING dentro do prazo, medido
 *   pelo relógio do PostgreSQL;
 * - `soldSeats`: alocações ainda ativas de reservas PAID. Um assento cancelado
 *   individualmente tem `releasedAt` preenchido e deixa de contar, mesmo que o
 *   `Payment` original continue APPROVED;
 * - `simulatedRevenueCents`: soma de `unitPriceCents` exatamente das mesmas
 *   alocações contadas em `soldSeats`. É a receita operacional vigente, não o
 *   histórico financeiro bruto: uma compra de dois assentos com um ingresso
 *   cancelado rende o valor de um assento, enquanto o `Payment` aprovado
 *   permanece intacto como histórico.
 */
async function readSessionMetrics(client: QueryClient, sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return []
  }

  return client.$queryRaw<SessionMetricsRow[]>(Prisma.sql`
    /* session-operational-metrics */
    WITH database_clock AS MATERIALIZED (
      SELECT clock_timestamp() AS "now"
    )
    SELECT
      session."id" AS "sessionId",
      (
        SELECT COUNT(*)::int
        FROM "Seat" AS seat
        WHERE seat."sessionId" = session."id"
      ) AS "capacity",
      (
        SELECT COUNT(*)::int
        FROM "ReservationSeat" AS allocation
        JOIN "Seat" AS seat ON seat."id" = allocation."seatId"
        JOIN "Reservation" AS hold ON hold."id" = allocation."reservationId"
        WHERE seat."sessionId" = session."id"
          AND allocation."releasedAt" IS NULL
          AND hold."status" = 'PENDING'
          AND hold."expiresAt" > database_clock."now"
      ) AS "heldSeats",
      (
        SELECT COUNT(*)::int
        FROM "ReservationSeat" AS allocation
        JOIN "Seat" AS seat ON seat."id" = allocation."seatId"
        JOIN "Reservation" AS purchase
          ON purchase."id" = allocation."reservationId"
        WHERE seat."sessionId" = session."id"
          AND allocation."releasedAt" IS NULL
          AND purchase."status" = 'PAID'
      ) AS "soldSeats",
      (
        SELECT COALESCE(SUM(allocation."unitPriceCents"), 0)::int
        FROM "ReservationSeat" AS allocation
        JOIN "Seat" AS seat ON seat."id" = allocation."seatId"
        JOIN "Reservation" AS purchase
          ON purchase."id" = allocation."reservationId"
        WHERE seat."sessionId" = session."id"
          AND allocation."releasedAt" IS NULL
          AND purchase."status" = 'PAID'
      ) AS "simulatedRevenueCents"
    FROM "Session" AS session
    CROSS JOIN database_clock
    WHERE session."id" IN (${Prisma.join(
      sessionIds.map((id) => Prisma.sql`${id}::uuid`),
    )})
  `)
}

export async function getSessionMetrics(
  sessionId: string,
  client: QueryClient = prisma,
): Promise<SessionMetrics> {
  const [row] = await readSessionMetrics(client, [sessionId])

  return toMetrics(
    row ?? {
      sessionId,
      capacity: 0,
      heldSeats: 0,
      soldSeats: 0,
      simulatedRevenueCents: 0,
    },
  )
}

/** Versão em lote para a listagem do organizador, sem N+1. */
export async function getSessionMetricsMap(
  sessionIds: string[],
  client: QueryClient = prisma,
) {
  const rows = await readSessionMetrics(client, sessionIds)

  return new Map(rows.map((row) => [row.sessionId, toMetrics(row)]))
}
