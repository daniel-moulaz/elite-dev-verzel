import { Prisma } from '../../generated/prisma/client.js'
import { SessionStatus } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'

type QueryClient = Pick<Prisma.TransactionClient, '$queryRaw'>

/**
 * Motivo derivado pelo backend para a edição estrutural de uma sessão. O
 * frontend nunca decide isso sozinho: ele apenas apresenta o que vem daqui.
 */
export type SessionEditabilityReason =
  /** Rascunho: edição completa e livre. */
  | 'DRAFT'
  /** Publicada, futura e sem nenhum estado que torne a alteração insegura. */
  | 'PUBLISHED_SAFE'
  /** A sessão já começou. */
  | 'SESSION_STARTED'
  /** Existe um hold PENDING ainda dentro do prazo segurando lugares. */
  | 'ACTIVE_HOLD'
  /** Existe compra paga ou qualquer ingresso emitido, em qualquer estado. */
  | 'COMMERCIAL_HISTORY'

export interface SessionEditability {
  allowed: boolean
  reason: SessionEditabilityReason
  /**
   * Reconstruir o mapa exige apagar e recriar `Seat`. As FKs de
   * `ReservationSeat` usam RESTRICT, então qualquer alocação histórica —
   * mesmo já liberada — impede a reconstrução sem destruir histórico.
   */
  layoutEditable: boolean
}

interface EditabilityFactsRow {
  sessionId: string
  sessionStarted: boolean
  activeHolds: number
  paidReservations: number
  ticketCount: number
  seatAllocations: number
}

export function sessionNotEditable(editability: SessionEditability) {
  const messages: Record<SessionEditabilityReason, string> = {
    DRAFT: 'Sessões publicadas não podem ser editadas.',
    PUBLISHED_SAFE: 'Sessões publicadas não podem ser editadas.',
    SESSION_STARTED: 'A sessão já começou e não pode mais ser alterada.',
    ACTIVE_HOLD:
      'Esta sessão possui uma reserva ativa. Aguarde o prazo terminar ou a compra ser concluída para alterá-la.',
    COMMERCIAL_HISTORY:
      'Esta sessão possui reservas ou ingressos associados. Filme, horário, local, preço e layout não podem mais ser alterados.',
  }

  return new HttpError(
    409,
    'SESSION_NOT_EDITABLE',
    messages[editability.reason],
  )
}

export function sessionLayoutNotEditable() {
  return new HttpError(
    409,
    'SESSION_LAYOUT_NOT_EDITABLE',
    'Esta sessão já teve lugares reservados alguma vez. O mapa não pode ser reconstruído sem apagar esse histórico; os demais dados continuam editáveis.',
  )
}

/**
 * Lê, em uma única consulta para todas as sessões pedidas, os fatos que
 * decidem a editabilidade — usando o relógio do PostgreSQL. Nenhuma decisão
 * depende de estado em memória ou do relógio do processo, e a listagem do
 * organizador não paga N+1.
 */
async function readEditabilityFacts(
  client: QueryClient,
  sessionIds: string[],
) {
  if (sessionIds.length === 0) {
    return []
  }

  return client.$queryRaw<EditabilityFactsRow[]>(Prisma.sql`
    /* session-editability-facts */
    WITH database_clock AS MATERIALIZED (
      SELECT clock_timestamp() AS "now"
    )
    SELECT
      session."id" AS "sessionId",
      (session."startsAt" <= database_clock."now") AS "sessionStarted",
      (
        SELECT COUNT(*)::int
        FROM "Reservation" AS hold
        WHERE hold."sessionId" = session."id"
          AND hold."status" = 'PENDING'
          AND hold."expiresAt" > database_clock."now"
          AND EXISTS (
            SELECT 1
            FROM "ReservationSeat" AS allocation
            WHERE allocation."reservationId" = hold."id"
              AND allocation."releasedAt" IS NULL
          )
      ) AS "activeHolds",
      (
        SELECT COUNT(*)::int
        FROM "Reservation" AS purchase
        WHERE purchase."sessionId" = session."id"
          AND purchase."status" = 'PAID'
      ) AS "paidReservations",
      (
        SELECT COUNT(*)::int
        FROM "Ticket" AS ticket
        WHERE ticket."sessionId" = session."id"
      ) AS "ticketCount",
      (
        SELECT COUNT(*)::int
        FROM "ReservationSeat" AS allocation
        JOIN "Seat" AS seat ON seat."id" = allocation."seatId"
        WHERE seat."sessionId" = session."id"
      ) AS "seatAllocations"
    FROM "Session" AS session
    CROSS JOIN database_clock
    WHERE session."id" IN (${Prisma.join(
      sessionIds.map((id) => Prisma.sql`${id}::uuid`),
    )})
  `)
}

function decide(
  status: SessionStatus,
  facts: EditabilityFactsRow,
): SessionEditability {
  const layoutEditable = facts.seatAllocations === 0
  const isDraft = status === SessionStatus.DRAFT

  // Um rascunho nunca foi exposto ao público nem vendido, e uma data no
  // passado é justamente o que o organizador precisa poder corrigir antes de
  // publicar; por isso o horário só bloqueia uma sessão já publicada.
  if (!isDraft && facts.sessionStarted) {
    return { allowed: false, reason: 'SESSION_STARTED', layoutEditable: false }
  }

  // Precedência: histórico comercial é mais definitivo que um hold em curso.
  if (facts.paidReservations > 0 || facts.ticketCount > 0) {
    return {
      allowed: false,
      reason: 'COMMERCIAL_HISTORY',
      layoutEditable: false,
    }
  }

  if (facts.activeHolds > 0) {
    return { allowed: false, reason: 'ACTIVE_HOLD', layoutEditable: false }
  }

  return isDraft
    ? { allowed: true, reason: 'DRAFT', layoutEditable }
    : { allowed: true, reason: 'PUBLISHED_SAFE', layoutEditable }
}

export async function getSessionEditability(
  sessionId: string,
  status: SessionStatus,
  client: QueryClient = prisma,
): Promise<SessionEditability> {
  const [facts] = await readEditabilityFacts(client, [sessionId])

  if (!facts) {
    throw new HttpError(404, 'SESSION_NOT_FOUND', 'Sessão não encontrada.')
  }

  return decide(status, facts)
}

/**
 * Versão em lote para a listagem do organizador: uma única consulta cobre
 * todas as sessões.
 */
export async function getSessionEditabilityMap(
  sessions: Array<{ id: string; status: SessionStatus }>,
  client: QueryClient = prisma,
) {
  const facts = await readEditabilityFacts(
    client,
    sessions.map(({ id }) => id),
  )
  const factsById = new Map(facts.map((row) => [row.sessionId, row]))
  const editabilityById = new Map<string, SessionEditability>()

  for (const session of sessions) {
    const sessionFacts = factsById.get(session.id)

    if (sessionFacts) {
      editabilityById.set(session.id, decide(session.status, sessionFacts))
    }
  }

  return editabilityById
}
