import { apiRequest, isRecord } from '@/lib/http'
import type { ExperienceLevel, Reliability } from '@/features/profile/saver-profile-api'

export type PublicProfile = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  city: string | null
  member_since: string
  reliability: Reliability
  active_tontines: number
  completed_cycles: number
  experience_level: ExperienceLevel | null
  shared_tontines: string[]
}

function isPublicProfile(value: unknown): value is PublicProfile {
  return isRecord(value) && typeof value.user_id === 'string' && typeof value.member_since === 'string' &&
    isRecord(value.reliability) && typeof value.reliability.score === 'string' &&
    Number.isInteger(value.active_tontines) && Array.isArray(value.shared_tontines)
}

export async function getPublicProfile(token: string, userId: string, signal?: AbortSignal): Promise<PublicProfile> {
  const payload = await apiRequest(token, `/api/v1/users/${encodeURIComponent(userId)}/profile`, { signal })
  if (!isPublicProfile(payload)) throw new Error('La fiche membre reçue est invalide')
  return payload
}
