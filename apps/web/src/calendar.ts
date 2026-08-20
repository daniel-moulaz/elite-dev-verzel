const icsLineBreak = '\r\n'
const icsLineMaximumBytes = 75

export interface CalendarEventInput {
  id: string
  movieTitle: string
  startsAt: string
  runtimeMinutes?: number | null
  venueName?: string | null
  roomName?: string | null
  address?: string | null
}

export interface CalendarFile {
  contents: string
  filename: string
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/\r\n|\r|\n/gu, '\\n')
    .replace(/;/gu, '\\;')
    .replace(/,/gu, '\\,')
}

function formatIcsUtc(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new Error('A sessão não possui uma data válida para a agenda.')
  }

  return value
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z')
}

function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  const foldedLines: string[] = []
  let currentLine = ''

  for (const character of line) {
    const candidate = `${currentLine}${character}`

    if (
      currentLine &&
      encoder.encode(candidate).byteLength > icsLineMaximumBytes
    ) {
      foldedLines.push(currentLine)
      currentLine = ` ${character}`
    } else {
      currentLine = candidate
    }
  }

  foldedLines.push(currentLine)
  return foldedLines.join(icsLineBreak)
}

function calendarSlug(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64)
    .replace(/-+$/u, '')

  return slug || 'sessao'
}

function calendarUid(id: string): string {
  const safeId = id.trim().replace(/[^A-Za-z0-9._-]/gu, '-') || 'sessao'
  return `${safeId}@septem.local`
}

export function createCalendarFile(
  event: CalendarEventInput,
  generatedAt = new Date(),
): CalendarFile {
  const startsAt = new Date(event.startsAt)
  const location = [event.venueName, event.roomName, event.address]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' — ')
  const description = [
    `Sessão SEPTEM de ${event.movieTitle}`,
    event.roomName?.trim() ? `Sala: ${event.roomName.trim()}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' — ')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SEPTEM//Cinema//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${calendarUid(event.id)}`,
    `DTSTAMP:${formatIcsUtc(generatedAt)}`,
    `DTSTART:${formatIcsUtc(startsAt)}`,
  ]

  if (
    event.runtimeMinutes !== null &&
    event.runtimeMinutes !== undefined &&
    Number.isInteger(event.runtimeMinutes) &&
    event.runtimeMinutes > 0
  ) {
    lines.push(
      `DTEND:${formatIcsUtc(
        new Date(startsAt.getTime() + event.runtimeMinutes * 60_000),
      )}`,
    )
  }

  lines.push(`SUMMARY:${escapeIcsText(`SEPTEM — ${event.movieTitle}`)}`)

  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`)
  }

  lines.push(
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  )

  return {
    contents: `${lines.map(foldIcsLine).join(icsLineBreak)}${icsLineBreak}`,
    filename: `septem-${calendarSlug(event.movieTitle)}.ics`,
  }
}

export function downloadCalendarFile(file: CalendarFile): void {
  const blob = new Blob([file.contents], {
    type: 'text/calendar;charset=utf-8',
  })
  const objectUrl = URL.createObjectURL(blob)
  const downloadLink = document.createElement('a')

  downloadLink.href = objectUrl
  downloadLink.download = file.filename
  downloadLink.hidden = true
  document.body.append(downloadLink)

  try {
    downloadLink.click()
  } finally {
    downloadLink.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
  }
}
