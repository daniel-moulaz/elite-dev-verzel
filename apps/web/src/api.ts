export type Role = 'ORGANIZER' | 'CUSTOMER' | 'GATE'

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
  role: Role
}

export interface CatalogMovie {
  id: number
  title: string
  overview: string | null
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string | null
  runtimeMinutes?: number | null
}

export interface SessionMovie {
  tmdbId: number
  title: string
  overview: string | null
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string | null
  runtimeMinutes: number | null
}

export type SessionStatus = 'DRAFT' | 'PUBLISHED'

export interface OrganizerSession {
  id: string
  status: SessionStatus
  startsAt: string
  venueName: string
  roomName: string
  address: string
  priceCents: number
  publishedAt: string | null
  capacity: number
  rows: number
  seatsPerRow: number
  movie: SessionMovie
}

export interface SessionInput {
  tmdbMovieId: number
  startsAt: string
  venueName: string
  roomName: string
  address: string
  priceCents: number
  rows: number
  seatsPerRow: number
}

export type SessionUpdateInput = Partial<SessionInput>

interface LoginResponse {
  accessToken: string
  user: AuthenticatedUser
}

interface MoviesResponse {
  movies: CatalogMovie[]
}

interface SessionsResponse {
  sessions: OrganizerSession[]
}

interface ErrorResponse {
  message?: unknown
}

const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3333').replace(
  /\/+$/,
  '',
)

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const errorBody = body as ErrorResponse | null
    const message =
      typeof errorBody?.message === 'string'
        ? errorBody.message
        : 'Não foi possível concluir a solicitação.'

    throw new ApiError(message, response.status)
  }

  return body as T
}

async function authenticatedRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)

  if (init.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
  })

  if (response.status === 401) {
    unauthorizedHandler?.()
  }

  return readResponse<T>(response)
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  return readResponse<LoginResponse>(response)
}

export function getCurrentUser(
  accessToken: string,
  signal?: AbortSignal,
): Promise<AuthenticatedUser> {
  return authenticatedRequest<AuthenticatedUser>('/auth/me', accessToken, {
    signal: signal ?? null,
  })
}

export function getCatalogMovies(
  accessToken: string,
  query = '',
  signal?: AbortSignal,
): Promise<MoviesResponse> {
  const params = new URLSearchParams()
  const normalizedQuery = query.trim()

  if (normalizedQuery) {
    params.set('q', normalizedQuery)
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : ''

  return authenticatedRequest<MoviesResponse>(
    `/catalog/movies${suffix}`,
    accessToken,
    { signal: signal ?? null },
  )
}

export function getCatalogMovie(
  accessToken: string,
  tmdbId: number,
  signal?: AbortSignal,
): Promise<CatalogMovie> {
  return authenticatedRequest<CatalogMovie>(
    `/catalog/movies/${tmdbId}`,
    accessToken,
    { signal: signal ?? null },
  )
}

export async function getOrganizerSessions(
  accessToken: string,
  signal?: AbortSignal,
): Promise<OrganizerSession[]> {
  const response = await authenticatedRequest<SessionsResponse>(
    '/organizer/sessions',
    accessToken,
    { signal: signal ?? null },
  )

  return response.sessions
}

export function getOrganizerSession(
  accessToken: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<OrganizerSession> {
  return authenticatedRequest<OrganizerSession>(
    `/organizer/sessions/${sessionId}`,
    accessToken,
    { signal: signal ?? null },
  )
}

export function createOrganizerSession(
  accessToken: string,
  input: SessionInput,
): Promise<OrganizerSession> {
  return authenticatedRequest<OrganizerSession>(
    '/organizer/sessions',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export function updateOrganizerSession(
  accessToken: string,
  sessionId: string,
  input: SessionUpdateInput,
): Promise<OrganizerSession> {
  return authenticatedRequest<OrganizerSession>(
    `/organizer/sessions/${sessionId}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )
}

export function publishOrganizerSession(
  accessToken: string,
  sessionId: string,
): Promise<OrganizerSession> {
  return authenticatedRequest<OrganizerSession>(
    `/organizer/sessions/${sessionId}/publish`,
    accessToken,
    { method: 'POST' },
  )
}
