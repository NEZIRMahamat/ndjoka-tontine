import { apiRequest, isRecord } from '@/lib/http'

export type ContributionRhythm = 'weekly' | 'monthly'
export type SavingsGoal = 'project' | 'emergency' | 'housing' | 'education' | 'business'
export type GroupSizePreference = 'small' | 'medium' | 'large'
export type ExperienceLevel = 'beginner' | 'intermediate' | 'experienced'
export type TurnPreference = 'early' | 'flexible' | 'late'
export type ReliabilityBand = 'excellent' | 'bon' | 'moyen' | 'fragile'

export type SaverProfileInput = {
  monthly_capacity: string
  preferred_rhythm: ContributionRhythm
  savings_goal: SavingsGoal
  horizon_months: number
  group_size_preference: GroupSizePreference
  experience_level: ExperienceLevel
  turn_preference: TurnPreference
}

export type SaverProfile = SaverProfileInput & {
  created_at: string
  updated_at: string
}

export type Reliability = {
  score: string
  band: ReliabilityBand
  is_provisional: boolean
  contributions_total: number
  contributions_on_time: number
  contributions_late: number
  contributions_outstanding: number
  cycles_completed: number
  on_time_rate: string | null
  explanation: string
}

export const RHYTHM_LABELS: Record<ContributionRhythm, string> = {
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
}

export const GOAL_LABELS: Record<SavingsGoal, string> = {
  project: 'Un projet personnel',
  emergency: 'Une épargne de précaution',
  housing: 'Un logement',
  education: 'Des études ou une formation',
  business: 'Une activité professionnelle',
}

export const GROUP_SIZE_LABELS: Record<GroupSizePreference, string> = {
  small: 'Petit groupe (2 à 6 membres)',
  medium: 'Groupe moyen (7 à 12 membres)',
  large: 'Grand groupe (13 membres et plus)',
}

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Je débute',
  intermediate: 'J’ai déjà participé',
  experienced: 'J’ai l’habitude',
}

export const TURN_LABELS: Record<TurnPreference, string> = {
  early: 'Recevoir tôt dans le cycle',
  flexible: 'Peu importe la position',
  late: 'Recevoir en fin de cycle',
}

export const BAND_LABELS: Record<ReliabilityBand, string> = {
  excellent: 'Excellent',
  bon: 'Bon',
  moyen: 'Moyen',
  fragile: 'À consolider',
}

const RHYTHMS = Object.keys(RHYTHM_LABELS)
const GOALS = Object.keys(GOAL_LABELS)
const GROUP_SIZES = Object.keys(GROUP_SIZE_LABELS)
const EXPERIENCES = Object.keys(EXPERIENCE_LABELS)
const TURNS = Object.keys(TURN_LABELS)

function isSaverProfile(value: unknown): value is SaverProfile {
  if (!isRecord(value)) return false
  return (
    typeof value.monthly_capacity === 'string' &&
    RHYTHMS.includes(String(value.preferred_rhythm)) &&
    GOALS.includes(String(value.savings_goal)) &&
    typeof value.horizon_months === 'number' &&
    GROUP_SIZES.includes(String(value.group_size_preference)) &&
    EXPERIENCES.includes(String(value.experience_level)) &&
    TURNS.includes(String(value.turn_preference))
  )
}

function isReliability(value: unknown): value is Reliability {
  if (!isRecord(value)) return false
  return (
    typeof value.score === 'string' &&
    Object.keys(BAND_LABELS).includes(String(value.band)) &&
    typeof value.is_provisional === 'boolean' &&
    typeof value.contributions_total === 'number' &&
    typeof value.contributions_on_time === 'number' &&
    typeof value.contributions_late === 'number' &&
    typeof value.contributions_outstanding === 'number' &&
    typeof value.cycles_completed === 'number' &&
    typeof value.explanation === 'string'
  )
}

/** Retourne null lorsque le profil n'a pas encore été renseigné. */
export async function getSaverProfile(
  accessToken: string,
  signal?: AbortSignal,
): Promise<SaverProfile | null> {
  try {
    const payload = await apiRequest(accessToken, '/api/v1/me/saver-profile', { signal })
    if (!isSaverProfile(payload)) throw new Error("Le profil d'épargne reçu est invalide")
    return payload
  } catch (caught) {
    if (caught instanceof Error && /statut 404|non renseigné/i.test(caught.message)) return null
    throw caught
  }
}

export async function saveSaverProfile(
  accessToken: string,
  input: SaverProfileInput,
): Promise<SaverProfile> {
  const payload = await apiRequest(accessToken, '/api/v1/me/saver-profile', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  if (!isSaverProfile(payload)) throw new Error("Le profil d'épargne reçu est invalide")
  return payload
}

export async function getReliability(
  accessToken: string,
  signal?: AbortSignal,
): Promise<Reliability> {
  const payload = await apiRequest(accessToken, '/api/v1/me/reliability', { signal })
  if (!isReliability(payload)) throw new Error('Le score de fiabilité reçu est invalide')
  return payload
}
