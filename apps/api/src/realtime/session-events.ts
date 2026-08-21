/**
 * Broadcaster de invalidação em memória.
 *
 * Uma mensagem publicada aqui NUNCA carrega o estado dos assentos: ela apenas
 * informa que a disponibilidade de uma sessão mudou. O cliente reage refazendo
 * `GET /sessions/:id/seats`, que continua sendo o snapshot autoritativo
 * derivado do PostgreSQL.
 *
 * Limitação conhecida e aceita: o fanout vale apenas para o processo atual.
 * Com múltiplas réplicas da API, um cliente conectado à réplica A não recebe
 * invalidações originadas na réplica B. Isso não corrompe o estado — apenas
 * atrasa a atualização até o próximo polling ou a próxima consulta. Um fanout
 * entre processos exigiria PostgreSQL LISTEN/NOTIFY (ou infraestrutura
 * equivalente) e não é necessário na topologia de instância única atual.
 */

export type SessionEventName = 'sync' | 'seats-changed' | 'session-changed'

type SessionEventListener = (event: SessionEventName) => void

const listenersBySession = new Map<string, Set<SessionEventListener>>()
const scheduledInvalidations = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Teto defensivo para os timers de invalidação. Eles são apenas um atalho de
 * latência visual; perder um deles não torna nenhum estado incorreto, porque a
 * expiração continua sendo decidida por `expiresAt` e pelo relógio do banco.
 */
const MAX_SCHEDULED_INVALIDATIONS = 2_048

export function subscribeToSessionEvents(
  sessionId: string,
  listener: SessionEventListener,
) {
  let listeners = listenersBySession.get(sessionId)

  if (!listeners) {
    listeners = new Set()
    listenersBySession.set(sessionId, listeners)
  }

  listeners.add(listener)

  return function unsubscribe() {
    const currentListeners = listenersBySession.get(sessionId)

    if (!currentListeners) {
      return
    }

    currentListeners.delete(listener)

    if (currentListeners.size === 0) {
      listenersBySession.delete(sessionId)
    }
  }
}

function publish(sessionId: string, event: SessionEventName) {
  const listeners = listenersBySession.get(sessionId)

  if (!listeners || listeners.size === 0) {
    return
  }

  // Cópia defensiva: um listener pode cancelar a própria inscrição ao escrever
  // em uma conexão já encerrada.
  for (const listener of [...listeners]) {
    listener(event)
  }
}

export function publishSeatsChanged(sessionId: string) {
  publish(sessionId, 'seats-changed')
}

/**
 * Sinaliza que os dados estruturais da sessão mudaram (horário, local, preço,
 * snapshot do filme ou layout). Como todo evento aqui, é só invalidação: o
 * cliente reconsulta os endpoints públicos da sessão.
 */
export function publishSessionChanged(sessionId: string) {
  publish(sessionId, 'session-changed')
}

export function sessionSubscriberCount(sessionId: string) {
  return listenersBySession.get(sessionId)?.size ?? 0
}

/**
 * Agenda uma invalidação para o instante em que um hold expira, de modo que
 * clientes com o mapa aberto vejam o assento voltar sem depender do próximo
 * polling. Nenhuma disponibilidade é mantida em memória: no disparo, apenas
 * publicamos o sinal e os clientes reconsultam o PostgreSQL.
 */
export function scheduleSeatsInvalidation(
  key: string,
  sessionId: string,
  at: Date,
) {
  const delay = at.getTime() - Date.now()

  if (
    !Number.isFinite(delay) ||
    (!scheduledInvalidations.has(key) &&
      scheduledInvalidations.size >= MAX_SCHEDULED_INVALIDATIONS)
  ) {
    return
  }

  cancelScheduledInvalidation(key)

  const timer = setTimeout(
    () => {
      scheduledInvalidations.delete(key)
      publishSeatsChanged(sessionId)
    },
    Math.max(0, delay),
  )

  // Um sinal pendente jamais deve segurar o processo aberto.
  timer.unref?.()
  scheduledInvalidations.set(key, timer)
}

export function cancelScheduledInvalidation(key: string) {
  const timer = scheduledInvalidations.get(key)

  if (timer) {
    clearTimeout(timer)
    scheduledInvalidations.delete(key)
  }
}
