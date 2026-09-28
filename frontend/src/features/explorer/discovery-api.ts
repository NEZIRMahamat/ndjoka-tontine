import { apiRequest, isRecord } from '@/lib/http'
import type { ContributionRhythm } from '@/features/profile/saver-profile-api'
import type { TontineCategory, TurnOrderMode } from '@/features/tontines/tontines-api'

export type AffinityReason = {
  criterion: 'budget' | 'rhythm' | 'group_size' | 'horizon' | 'profile'
  label: string
  matched: boolean
}

export type DiscoveredTontine = {
  id: string
  name: string
  description: string | null
  currency: string
  max_members: number | null
  member_count: number
  seats_left: number | null
  contribution_amount: string | null
  frequency: ContributionRhythm | null
  monthly_equivalent: string | null
  min_reliability_score: string | null
  created_at: string
  status: 'draft' | 'active' | 'archived'
  category: TontineCategory
  goal: string | null
  city: string | null
  order_mode: TurnOrderMode
  rules: string | null
  late_penalty_enabled: boolean
  cover_image_url: string | null
  cycle_status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled' | null
  start_date: string | null
  organizer_name: string | null
  organizer_since: string | null
  affinity_score: string
  is_eligible: boolean
  ineligibility_reason: string | null
  reasons: AffinityReason[]
}

export type DiscoveryResult = {
  items: DiscoveredTontine[]
  total: number
  limit: number
  offset: number
  has_profile: boolean
  reliability_score: string
}

function isReason(value: unknown): value is AffinityReason {
  return (
    isRecord(value) &&
    ['budget', 'rhythm', 'group_size', 'horizon', 'profile'].includes(String(value.criterion)) &&
    typeof value.label === 'string' &&
    typeof value.matched === 'boolean'
  )
}

function isDiscovered(value: unknown): value is DiscoveredTontine {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    typeof value.currency === 'string' &&
    (value.max_members === null || Number.isInteger(value.max_members)) &&
    Number.isInteger(value.member_count) &&
    (value.seats_left === null || Number.isInteger(value.seats_left)) &&
    (value.contribution_amount === null || typeof value.contribution_amount === 'string') &&
    (value.frequency === null || value.frequency === 'weekly' || value.frequency === 'monthly') &&
    (value.monthly_equivalent === null || typeof value.monthly_equivalent === 'string') &&
    (value.min_reliability_score === null || typeof value.min_reliability_score === 'string') &&
    typeof value.created_at === 'string' &&
    typeof value.category === 'string' &&
    typeof value.order_mode === 'string' &&
    typeof value.late_penalty_enabled === 'boolean' &&
    typeof value.affinity_score === 'string' &&
    typeof value.is_eligible === 'boolean' &&
    (value.ineligibility_reason === null || typeof value.ineligibility_reason === 'string') &&
    Array.isArray(value.reasons) &&
    value.reasons.every(isReason)
  )
}

function isDiscoveryResult(value: unknown): value is DiscoveryResult {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isDiscovered) &&
    Number.isInteger(value.total) &&
    Number.isInteger(value.limit) &&
    Number.isInteger(value.offset) &&
    typeof value.has_profile === 'boolean' &&
    typeof value.reliability_score === 'string'
  )
}

export type DiscoveryQuery = {
  search?: string
  frequency?: ContributionRhythm
  limit?: number
  offset?: number
  eligibleOnly?: boolean
}

export async function discoverTontines(
  accessToken: string,
  query: DiscoveryQuery = {},
  signal?: AbortSignal,
): Promise<DiscoveryResult> {
  const params = new URLSearchParams()
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.frequency) params.set('frequency', query.frequency)
  params.set('limit', String(query.limit ?? 20))
  params.set('offset', String(query.offset ?? 0))
  if (query.eligibleOnly) params.set('eligible_only', 'true')

  const payload = await apiRequest(accessToken, `/api/v1/discovery/tontines?${params}`, { signal })
  if (!isDiscoveryResult(payload)) {
    throw new Error('La liste de tontines reçue est invalide')
  }
  return payload
}

export async function getDiscoveredTontine(
  accessToken: string,
  tontineId: string,
  signal?: AbortSignal,
): Promise<DiscoveredTontine> {
  const payload = await apiRequest(
    accessToken, `/api/v1/discovery/tontines/${encodeURIComponent(tontineId)}`, { signal },
  )
  if (!isDiscovered(payload)) throw new Error('La tontine reçue est invalide')
  return payload
}

export async function joinTontine(accessToken: string, tontineId: string): Promise<void> {
  await apiRequest(accessToken, `/api/v1/discovery/tontines/${encodeURIComponent(tontineId)}/join`, {
    method: 'POST',
  })
}


export type DiscoveredMember = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  city: string | null
  role: 'owner' | 'manager' | 'treasurer' | 'member'
  joined_at: string
  member_since: string
  reliability_score: string
  reliability_band: string
  reliability_provisional: boolean
  turn_position: number | null
}

function isDiscoveredMember(value: unknown): value is DiscoveredMember {
  return isRecord(value) && typeof value.user_id === 'string' && typeof value.role === 'string' &&
    typeof value.reliability_score === 'string' && typeof value.reliability_provisional === 'boolean'
}

export async function getDiscoverableMembers(accessToken: string, tontineId: string, signal?: AbortSignal): Promise<DiscoveredMember[]> {
  const payload = await apiRequest(accessToken, `/api/v1/discovery/tontines/${encodeURIComponent(tontineId)}/members`, { signal })
  if (!isRecord(payload) || !Array.isArray(payload.items) || !payload.items.every(isDiscoveredMember)) {
    throw new Error('La liste des membres reçue est invalide')
  }
  return payload.items
}
