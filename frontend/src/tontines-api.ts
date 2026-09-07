import { apiRequest, isRecord } from './api'

export type TontineStatus = 'draft' | 'active' | 'archived'
export type MembershipRole = 'owner' | 'manager' | 'treasurer' | 'member'
export type MembershipStatus = 'active' | 'left' | 'removed'
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export type Tontine = {
  id: string
  name: string
  description: string | null
  currency: string
  max_members: number | null
  status: TontineStatus
  created_by_user_id: string
  created_at: string
  updated_at: string
  archived_at: string | null
}
export type TontineInput = Pick<Tontine, 'name' | 'description' | 'currency' | 'max_members'>
export type TontinePage = { items: Tontine[]; total: number; limit: number; offset: number }

export type Membership = {
  id: string
  tontine_id: string
  user_id: string
  role: MembershipRole
  status: MembershipStatus
  joined_at: string
  updated_at: string
  ended_at: string | null
}
export type MembershipPage = { items: Membership[]; total: number; limit: number; offset: number }

export type Invitation = {
  id: string
  tontine_id: string
  email: string
  role: Exclude<MembershipRole, 'owner'>
  status: InvitationStatus
  invited_by_user_id: string
  accepted_by_user_id: string | null
  created_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}
export type CreatedInvitation = Invitation & { token: string }
export type InvitationPage = { items: Invitation[]; total: number; limit: number; offset: number }

function isTontine(value: unknown): value is Tontine {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
    typeof value.currency === 'string' && typeof value.created_by_user_id === 'string' &&
    typeof value.created_at === 'string' && typeof value.updated_at === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    (value.max_members === null || Number.isInteger(value.max_members)) &&
    (value.archived_at === null || typeof value.archived_at === 'string') &&
    ['draft', 'active', 'archived'].includes(String(value.status))
}

function isMembership(value: unknown): value is Membership {
  return isRecord(value) && typeof value.id === 'string' &&
    typeof value.tontine_id === 'string' && typeof value.user_id === 'string' &&
    ['owner', 'manager', 'treasurer', 'member'].includes(String(value.role)) &&
    ['active', 'left', 'removed'].includes(String(value.status)) &&
    typeof value.joined_at === 'string' && typeof value.updated_at === 'string' &&
    (value.ended_at === null || typeof value.ended_at === 'string')
}

function isInvitation(value: unknown): value is Invitation {
  return isRecord(value) && typeof value.id === 'string' &&
    typeof value.tontine_id === 'string' && typeof value.email === 'string' &&
    ['manager', 'treasurer', 'member'].includes(String(value.role)) &&
    ['pending', 'accepted', 'expired', 'revoked'].includes(String(value.status)) &&
    typeof value.invited_by_user_id === 'string' && typeof value.created_at === 'string' &&
    typeof value.expires_at === 'string'
}

function parsePage<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): { items: T[]; total: number; limit: number; offset: number } {
  if (!isRecord(value) || !Array.isArray(value.items) || !value.items.every(guard) ||
      typeof value.total !== 'number' || typeof value.limit !== 'number' ||
      typeof value.offset !== 'number') throw new Error(`${label} reçue est invalide`)
  return value as { items: T[]; total: number; limit: number; offset: number }
}

export async function listTontines(token: string, offset = 0, signal?: AbortSignal, status?: TontineStatus): Promise<TontinePage> {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) })
  if (status) params.set('status', status)
  return parsePage(await apiRequest(token, `/api/v1/tontines?${params}`, { signal }), isTontine, 'La liste')
}

export async function createTontine(token: string, input: TontineInput): Promise<Tontine> {
  const payload = await apiRequest(token, '/api/v1/tontines', { method: 'POST', body: JSON.stringify(input) })
  if (!isTontine(payload)) throw new Error('La tontine reçue est invalide')
  return payload
}

export async function updateTontine(token: string, id: string, input: Partial<TontineInput>): Promise<Tontine> {
  const payload = await apiRequest(token, `/api/v1/tontines/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  if (!isTontine(payload)) throw new Error('La tontine reçue est invalide')
  return payload
}

export async function archiveTontine(token: string, id: string): Promise<Tontine> {
  const payload = await apiRequest(token, `/api/v1/tontines/${id}/archive`, { method: 'POST' })
  if (!isTontine(payload)) throw new Error('La tontine reçue est invalide')
  return payload
}

export async function listMembers(token: string, id: string, signal?: AbortSignal): Promise<MembershipPage> {
  return parsePage(await apiRequest(token, `/api/v1/tontines/${id}/members?limit=100&offset=0`, { signal }), isMembership, 'La liste des membres')
}

export async function listInvitations(token: string, id: string, signal?: AbortSignal): Promise<InvitationPage> {
  return parsePage(await apiRequest(token, `/api/v1/tontines/${id}/invitations?limit=100&offset=0`, { signal }), isInvitation, 'La liste des invitations')
}

export async function createInvitation(
  token: string, id: string, email: string, role: Exclude<MembershipRole, 'owner'>,
): Promise<CreatedInvitation> {
  const payload = await apiRequest(token, `/api/v1/tontines/${id}/invitations`, {
    method: 'POST', body: JSON.stringify({ email, role }),
  })
  if (!isInvitation(payload) || !isRecord(payload) || typeof (payload as Record<string, unknown>).token !== 'string') {
    throw new Error("L'invitation reçue est invalide")
  }
  return payload as CreatedInvitation
}

export async function revokeInvitation(token: string, tontineId: string, invitationId: string): Promise<Invitation> {
  const payload = await apiRequest(token, `/api/v1/tontines/${tontineId}/invitations/${invitationId}/revoke`, { method: 'POST' })
  if (!isInvitation(payload)) throw new Error("L'invitation reçue est invalide")
  return payload
}

export async function acceptInvitation(token: string, invitationToken: string): Promise<Membership> {
  const payload = await apiRequest(token, '/api/v1/invitations/accept', {
    method: 'POST', body: JSON.stringify({ token: invitationToken }),
  })
  if (!isMembership(payload)) throw new Error("L'adhésion reçue est invalide")
  return payload
}

export async function changeMemberRole(
  token: string, tontineId: string, userId: string, role: Exclude<MembershipRole, 'owner'>,
): Promise<Membership> {
  const payload = await apiRequest(token, `/api/v1/tontines/${tontineId}/members/${userId}/role`, {
    method: 'PATCH', body: JSON.stringify({ role }),
  })
  if (!isMembership(payload)) throw new Error("L'adhésion reçue est invalide")
  return payload
}

export async function removeMember(token: string, tontineId: string, userId: string): Promise<Membership> {
  const payload = await apiRequest(token, `/api/v1/tontines/${tontineId}/members/${userId}/remove`, { method: 'POST' })
  if (!isMembership(payload)) throw new Error("L'adhésion reçue est invalide")
  return payload
}

export async function leaveTontine(token: string, tontineId: string): Promise<Membership> {
  const payload = await apiRequest(token, `/api/v1/tontines/${tontineId}/members/me/leave`, { method: 'POST' })
  if (!isMembership(payload)) throw new Error("L'adhésion reçue est invalide")
  return payload
}

export async function transferOwnership(token: string, tontineId: string, userId: string): Promise<Membership> {
  const payload = await apiRequest(token, `/api/v1/tontines/${tontineId}/ownership-transfer`, {
    method: 'POST', body: JSON.stringify({ new_owner_user_id: userId }),
  })
  if (!isMembership(payload)) throw new Error("L'adhésion reçue est invalide")
  return payload
}
