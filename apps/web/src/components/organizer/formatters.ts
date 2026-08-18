const sessionDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatSessionDate(value: string): string {
  return sessionDateFormatter.format(new Date(value))
}

export function formatPrice(priceCents: number): string {
  return moneyFormatter.format(priceCents / 100)
}

export function movieYear(releaseDate: string | null): string {
  return releaseDate?.slice(0, 4) || 'Ano não informado'
}

export function tmdbPosterUrl(path: string | null): string | null {
  return path?.startsWith('/')
    ? `https://image.tmdb.org/t/p/w500${path}`
    : null
}

export function toDateTimeLocalValue(value: string): string {
  const date = new Date(value)
  const localTime = date.getTime() - date.getTimezoneOffset() * 60_000

  return new Date(localTime).toISOString().slice(0, 16)
}
