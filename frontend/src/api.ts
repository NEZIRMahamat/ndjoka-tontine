export type UserStatus = 'active' | 'suspended' | 'deactivated'
export type GlobalRole = 'user' | 'support' | 'platform_admin'

export type UserProfile = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  locale: string
  timezone: string
  status: UserStatus
  global_role: GlobalRole
  created_at: string
  updated_at: string
  deactivated_at: string | null
}

export type CurrentUserResponse = UserProfile & {
  authenticated: true
  sub: string
  permissions: string[]
  message: string
}

export type AdminUser = UserProfile & { auth0_sub: string }
export type UserPage = { items: AdminUser[]; total: number; limit: number; offset: number }

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

function isUserProfile(value: unknown): value is UserProfile {
  return isRecord(value) && typeof value.id === 'string' &&
    (value.email === null || typeof value.email === 'string') &&
    (value.display_name === null || typeof value.display_name === 'string') &&
    (value.avatar_url === null || typeof value.avatar_url === 'string') &&
    typeof value.locale === 'string' && typeof value.timezone === 'string' &&
    ['active', 'suspended', 'deactivated'].includes(String(value.status)) &&
    ['user', 'support', 'platform_admin'].includes(String(value.global_role)) &&
    typeof value.created_at === 'string' && typeof value.updated_at === 'string' &&
    (value.deactivated_at === null || typeof value.deactivated_at === 'string')
}

function parseCurrentUser(value: unknown): CurrentUserResponse {
  if (!isUserProfile(value)) throw new Error("La réponse du profil n'a pas le format attendu")
  const record = value as unknown as Record<string, unknown>
  if (record.authenticated !== true || typeof record.sub !== 'string' ||
      !Array.isArray(record.permissions) ||
      !record.permissions.every((permission: unknown) => typeof permission === 'string') ||
      typeof record.message !== 'string') {
    throw new Error("La réponse du profil n'a pas le format attendu")
  }
  return value as CurrentUserResponse
}

export async function getCurrentUser(accessToken: string, signal?: AbortSignal): Promise<CurrentUserResponse> {
  return parseCurrentUser(await apiRequest(accessToken, '/api/v1/me', { signal }))
}

export async function updateCurrentUser(
  accessToken: string,
  changes: { display_name?: string; avatar_url?: string | null; locale?: string; timezone?: string },
): Promise<CurrentUserResponse> {
  return parseCurrentUser(await apiRequest(accessToken, '/api/v1/me', {
    method: 'PATCH', body: JSON.stringify(changes),
  }))
}

export async function deactivateCurrentUser(accessToken: string): Promise<CurrentUserResponse> {
  return parseCurrentUser(await apiRequest(accessToken, '/api/v1/me/deactivate', { method: 'POST' }))
}

export async function listAdminUsers(
  accessToken: string,
  offset: number,
  status?: UserStatus | '',
  role?: GlobalRole | '',
  signal?: AbortSignal,
): Promise<UserPage> {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) })
  if (status) params.set('status', status)
  if (role) params.set('global_role', role)
  const payload = await apiRequest(accessToken, `/api/v1/admin/users?${params}`, { signal })
  if (!isRecord(payload) || !Array.isArray(payload.items) ||
      !payload.items.every((item) => isUserProfile(item) && isRecord(item) && typeof (item as Record<string, unknown>).auth0_sub === 'string') ||
      typeof payload.total !== 'number' || typeof payload.limit !== 'number' ||
      typeof payload.offset !== 'number') {
    throw new Error("La liste des utilisateurs n'a pas le format attendu")
  }
  return payload as UserPage
}

export async function changeAdminUserStatus(
  accessToken: string, userId: string, status: UserStatus,
): Promise<AdminUser> {
  const payload = await apiRequest(accessToken, `/api/v1/admin/users/${userId}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  })
  if (!isUserProfile(payload) || !isRecord(payload) || typeof (payload as Record<string, unknown>).auth0_sub !== 'string') {
    throw new Error("Le profil reçu n'a pas le format attendu")
  }
  return payload as AdminUser
}

export async function changeAdminUserRole(
  accessToken: string, userId: string, globalRole: GlobalRole,
): Promise<AdminUser> {
  const payload = await apiRequest(accessToken, `/api/v1/admin/users/${userId}/role`, {
    method: 'PATCH', body: JSON.stringify({ global_role: globalRole }),
  })
  if (!isUserProfile(payload) || !isRecord(payload) || typeof (payload as Record<string, unknown>).auth0_sub !== 'string') {
    throw new Error("Le profil reçu n'a pas le format attendu")
  }
  return payload as AdminUser
}
