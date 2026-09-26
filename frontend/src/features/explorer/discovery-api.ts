import { apiRequest, isRecord } from '@/lib/http'
import type { ContributionRhythm } from '@/features/profile/saver-profile-api'

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
    typeof value.criterion === 'string' &&
    typeof value.label === 'string' &&
    typeof value.matched === 'boolean'
  )
}

function isDiscovered(value: unknown): value is DiscoveredTontine {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.currency === 'string' &&
    typeof value.member_count === 'number' &&
    typeof value.affinity_score === 'string' &&
    typeof value.is_eligible === 'boolean' &&
    Array.isArray(value.reasons) &&
    value.reasons.every(isReason)
  )
}

export type DiscoveryQuery = {
  search?: string
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
  params.set('limit', String(query.limit ?? 20))
  params.set('offset', String(query.offset ?? 0))
  if (query.eligibleOnly) params.set('eligible_only', 'true')

  const payload = await apiRequest(accessToken, `/api/v1/discovery/tontines?${params}`, { signal })
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.items) ||
    !payload.items.every(isDiscovered) ||
    typeof payload.total !== 'number' ||
    typeof payload.has_profile !== 'boolean' ||
    typeof payload.reliability_score !== 'string'
  ) {
    throw new Error('La liste de tontines reçue est invalide')
  }
  return payload as unknown as DiscoveryResult
}

export async function joinTontine(accessToken: string, tontineId: string): Promise<void> {
  await apiRequest(accessToken, `/api/v1/discovery/tontines/${tontineId}/join`, {
    method: 'POST',
  })
}
