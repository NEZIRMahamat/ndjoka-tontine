import { apiRequest, isRecord } from '@/lib/http'
import { isUserProfile, type GlobalRole, type UserProfile, type UserStatus } from '@/features/profile/profile-api'

export type { GlobalRole, UserStatus } from '@/features/profile/profile-api'
export type AdminUser = UserProfile & { auth0_sub: string }
export type UserPage = { items: AdminUser[]; total: number; limit: number; offset: number }

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
