export type CurrentUserResponse = {
  authenticated: boolean
  sub: string
  permissions: string[]
  message: string
}

function getApiBaseUrl(): string {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '')

  if (!apiBaseUrl) {
    throw new Error("La variable VITE_API_BASE_URL n'est pas configurée")
  }

  return apiBaseUrl
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCurrentUserResponse(value: unknown): value is CurrentUserResponse {
  return (
    isRecord(value) &&
    typeof value.authenticated === 'boolean' &&
    typeof value.sub === 'string' &&
    Array.isArray(value.permissions) &&
    value.permissions.every((permission) => typeof permission === 'string') &&
    typeof value.message === 'string'
  )
}

function getErrorDetail(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.detail !== 'string') {
    return null
  }

  return payload.detail
}

export async function getCurrentUser(
  accessToken: string,
  signal: AbortSignal,
): Promise<CurrentUserResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Le statut HTTP reste l'information utile si la réponse n'est pas du JSON.
  }

  if (!response.ok) {
    const detail = getErrorDetail(payload)
    throw new Error(detail ?? `L'API a répondu avec le statut ${response.status}`)
  }

  if (!isCurrentUserResponse(payload)) {
    throw new Error("La réponse de l'API n'a pas le format attendu")
  }

  return payload
}
