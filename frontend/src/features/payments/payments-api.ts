import { apiRequest, isRecord } from '@/lib/http'

export type ContributionStatus = 'pending' | 'declared' | 'confirmed' | 'rejected' | 'late' | 'cancelled'
export type PayoutStatus = 'pending' | 'ready' | 'approved' | 'declared_paid' | 'received' | 'disputed' | 'cancelled'

export type Contribution = {
  id: string
  cycle_id: string
  cycle_name: string | null
  cycle_sequence: number | null
  tontine_id: string | null
  tontine_name: string | null
  currency: string | null
  amount_due: string
  status: 'pending' | 'declared' | 'confirmed' | 'rejected' | 'cancelled'
  effective_status: ContributionStatus
  due_at: string
  declared_at: string | null
  confirmed_at: string | null
  rejection_reason: string | null
}

export type Payout = {
  id: string
  tontine_id: string
  cycle_id: string
  expected_amount: string
  available_amount: string
  approved_amount: string | null
  currency: string
  status: PayoutStatus
  scheduled_for: string
  received_at: string | null
  platform_fee?: string | null
  solidarity_fund_share?: string | null
  net_amount?: string | null
}

export type ActivityPage<T> = { items: T[]; total: number; limit: number; offset: number }

export type MonthlyContribution = {
  month: string
  currency: string
  confirmed_amount: string
  count: number
}

function isContribution(value: unknown): value is Contribution {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.cycle_id === 'string' &&
    (value.cycle_name === null || typeof value.cycle_name === 'string') &&
    (value.cycle_sequence === null || typeof value.cycle_sequence === 'number') &&
    (value.tontine_id === null || typeof value.tontine_id === 'string') &&
    (value.tontine_name === null || typeof value.tontine_name === 'string') &&
    (value.currency === null || typeof value.currency === 'string') &&
    typeof value.amount_due === 'string' &&
    ['pending', 'declared', 'confirmed', 'rejected', 'cancelled'].includes(String(value.status)) &&
    ['pending', 'declared', 'confirmed', 'rejected', 'late', 'cancelled'].includes(String(value.effective_status)) &&
    typeof value.due_at === 'string' &&
    (value.declared_at === null || typeof value.declared_at === 'string') &&
    (value.confirmed_at === null || typeof value.confirmed_at === 'string') &&
    (value.rejection_reason === null || typeof value.rejection_reason === 'string')
  )
}

function isPayout(value: unknown): value is Payout {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.tontine_id === 'string' &&
    typeof value.cycle_id === 'string' &&
    typeof value.expected_amount === 'string' &&
    typeof value.available_amount === 'string' &&
    (value.approved_amount === null || typeof value.approved_amount === 'string') &&
    typeof value.currency === 'string' &&
    ['pending', 'ready', 'approved', 'declared_paid', 'received', 'disputed', 'cancelled'].includes(String(value.status)) &&
    typeof value.scheduled_for === 'string' &&
    (value.received_at === null || typeof value.received_at === 'string')
  )
}

function parsePage<T>(value: unknown, isItem: (item: unknown) => item is T, label: string): ActivityPage<T> {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(isItem) ||
    typeof value.total !== 'number' ||
    typeof value.limit !== 'number' ||
    typeof value.offset !== 'number'
  ) {
    throw new Error(`La liste ${label} reçue est invalide`)
  }
  return { items: value.items, total: value.total, limit: value.limit, offset: value.offset }
}

export async function getMyContributions(
  accessToken: string,
  signal?: AbortSignal,
  offset = 0,
  order: 'asc' | 'desc' = 'asc',
): Promise<ActivityPage<Contribution>> {
  const params = new URLSearchParams({ limit: '100', offset: String(offset), order })
  const payload = await apiRequest(accessToken, `/api/v1/me/contributions?${params}`, { signal })
  return parsePage(payload, isContribution, 'des cotisations')
}

export async function getMonthlyContributions(
  accessToken: string,
  signal?: AbortSignal,
): Promise<MonthlyContribution[]> {
  const payload = await apiRequest(accessToken, '/api/v1/me/contributions/monthly', { signal })
  if (!Array.isArray(payload) || !payload.every((item) =>
    isRecord(item) && typeof item.month === 'string' && typeof item.currency === 'string'
    && typeof item.confirmed_amount === 'string' && Number.isInteger(item.count))) {
    throw new Error('Le suivi mensuel des cotisations reçu est invalide')
  }
  return payload
}

export async function getMyPayouts(
  accessToken: string,
  signal?: AbortSignal,
  offset = 0,
  order: 'asc' | 'desc' = 'asc',
): Promise<ActivityPage<Payout>> {
  const params = new URLSearchParams({ limit: '100', offset: String(offset), order })
  const payload = await apiRequest(accessToken, `/api/v1/me/payouts?${params}`, { signal })
  return parsePage(payload, isPayout, 'des versements')
}

export async function getContribution(accessToken: string, contributionId: string, signal?: AbortSignal): Promise<Contribution> {
  const payload = await apiRequest(accessToken, `/api/v1/contributions/${encodeURIComponent(contributionId)}`, { signal })
  if (!isContribution(payload)) throw new Error('La cotisation reçue est invalide')
  return payload
}

export async function getPayout(accessToken: string, payoutId: string, signal?: AbortSignal): Promise<Payout> {
  const payload = await apiRequest(accessToken, `/api/v1/payouts/${encodeURIComponent(payoutId)}`, { signal })
  if (!isPayout(payload)) throw new Error('Le versement reçu est invalide')
  return payload
}

export async function confirmPayoutReceipt(accessToken: string, payoutId: string): Promise<Payout> {
  const payload = await apiRequest(accessToken, `/api/v1/payouts/${encodeURIComponent(payoutId)}/confirm-receipt`, {
    method: 'POST',
  })
  if (!isPayout(payload)) throw new Error('Le versement reçu est invalide')
  return payload
}

export async function disputePayout(
  accessToken: string,
  payoutId: string,
  reason: string,
): Promise<Payout> {
  const payload = await apiRequest(accessToken, `/api/v1/payouts/${encodeURIComponent(payoutId)}/dispute`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
  if (!isPayout(payload)) throw new Error('Le versement reçu est invalide')
  return payload
}
