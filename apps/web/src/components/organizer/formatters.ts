const sessionDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const sessionDayFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
})

const compactSessionDayFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
})

const sessionTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

export function formatSessionDate(value: string): string {
  return sessionDateFormatter.format(new Date(value))
}

export function formatPrice(priceCents: number): string {
  return moneyFormatter.format(priceCents / 100)
}

export function formatSessionDay(value: string): string {
  const label = sessionDayFormatter.format(new Date(value))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatCompactSessionDay(value: string): string {
  return compactSessionDayFormatter.format(new Date(value)).replace(/\.$/, '')
}

export function formatSessionTime(value: string): string {
  return sessionTimeFormatter.format(new Date(value))
}

export function movieYear(releaseDate: string | null): string {
  return releaseDate?.slice(0, 4) ?? ''
}

export function tmdbPosterUrl(path: string | null): string | null {
  return path?.startsWith('/')
    ? `https://image.tmdb.org/t/p/w500${path}`
    : null
}

export function tmdbBackdropUrl(path: string | null): string | null {
  return path?.startsWith('/')
    ? `https://image.tmdb.org/t/p/w1280${path}`
    : null
}

export function toDateTimeLocalValue(value: string): string {
  const date = new Date(value)
  const localTime = date.getTime() - date.getTimezoneOffset() * 60_000

  return new Date(localTime).toISOString().slice(0, 16)
}
