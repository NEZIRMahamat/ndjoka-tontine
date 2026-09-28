import { apiRequest, isRecord } from '@/lib/http'

export type UserStatus = 'active' | 'suspended' | 'deactivated'
export type GlobalRole = 'user' | 'support' | 'platform_admin'

export type UserProfile = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  locale: string
  timezone: string
  phone: string | null
  address: string | null
  city: string | null
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

export function isUserProfile(value: unknown): value is UserProfile {
  return isRecord(value) && typeof value.id === 'string' &&
    (value.email === null || typeof value.email === 'string') &&
    (value.display_name === null || typeof value.display_name === 'string') &&
    (value.avatar_url === null || typeof value.avatar_url === 'string') &&
    typeof value.locale === 'string' && typeof value.timezone === 'string' &&
    (value.phone === null || value.phone === undefined || typeof value.phone === 'string') &&
    (value.address === null || value.address === undefined || typeof value.address === 'string') &&
    (value.city === null || value.city === undefined || typeof value.city === 'string') &&
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
  changes: {
    display_name?: string
    avatar_url?: string | null
    locale?: string
    timezone?: string
    phone?: string | null
    address?: string | null
    city?: string | null
  },
): Promise<CurrentUserResponse> {
  return parseCurrentUser(await apiRequest(accessToken, '/api/v1/me', {
    method: 'PATCH', body: JSON.stringify(changes),
  }))
}

export async function deactivateCurrentUser(accessToken: string): Promise<CurrentUserResponse> {
  return parseCurrentUser(await apiRequest(accessToken, '/api/v1/me/deactivate', { method: 'POST' }))
}
