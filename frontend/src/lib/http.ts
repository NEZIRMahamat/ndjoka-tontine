export function getApiBaseUrl(): string {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  if (!apiBaseUrl) throw new Error("La variable VITE_API_BASE_URL n'est pas configurée")
  return apiBaseUrl
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function errorMessage(payload: unknown, status: number): string {
  if (isRecord(payload) && typeof payload.detail === 'string') return payload.detail
  if (isRecord(payload) && Array.isArray(payload.detail)) {
    return payload.detail.map((error) =>
      isRecord(error) && typeof error.msg === 'string' ? error.msg : 'Champ invalide',
    ).join(' · ')
  }
  return `L'API a répondu avec le statut ${status}`
}

export async function apiRequest(
  accessToken: string,
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorMessage(payload, response.status))
  return payload
}

export type OffsetPage<T> = { items: T[]; total: number; limit: number; offset: number }

export function parseOffsetPage<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): OffsetPage<T> {
  if (!isRecord(value) || !Array.isArray(value.items) || !value.items.every(guard) ||
      typeof value.total !== 'number' || typeof value.limit !== 'number' ||
      typeof value.offset !== 'number') throw new Error(`${label} reçue est invalide`)
  return value as OffsetPage<T>
}

export type CursorPage<T> = { items: T[]; next_cursor: string | null; limit: number }

export function parseCursorPage<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): CursorPage<T> {
  if (!isRecord(value) || !Array.isArray(value.items) || !value.items.every(guard) ||
      (value.next_cursor !== null && typeof value.next_cursor !== 'string') ||
      typeof value.limit !== 'number') throw new Error(`${label} reçue est invalide`)
  return value as CursorPage<T>
}

export function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback
}
