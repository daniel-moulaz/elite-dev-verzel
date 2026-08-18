export type Role = 'ORGANIZER' | 'CUSTOMER' | 'GATE'

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
  role: Role
}

interface LoginResponse {
  accessToken: string
  user: AuthenticatedUser
}

interface ErrorResponse {
  message?: unknown
}

const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3333').replace(
  /\/+$/,
  '',
)

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

export async function getCurrentUser(
  accessToken: string,
  signal?: AbortSignal,
): Promise<AuthenticatedUser> {
  const response = await fetch(`${apiUrl}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: signal ?? null,
  })

  return readResponse<AuthenticatedUser>(response)
}
