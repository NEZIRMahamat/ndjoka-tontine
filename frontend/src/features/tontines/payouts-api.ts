import {
  apiRequest,
  isRecord,
  parseOffsetPage,
  type OffsetPage,
} from '@/lib/http'

export type PayoutStatus =
  | 'pending'
  | 'ready'
  | 'approved'
  | 'declared_paid'
  | 'received'
  | 'disputed'
  | 'cancelled'

export type Payout = {
  id: string
  tontine_id: string
  cycle_id: string
  turn_id: string
  beneficiary_membership_id: string
  expected_amount: string
  available_amount: string
  approved_amount: string | null
  currency: string
  status: PayoutStatus
  scheduled_for: string
  approved_at: string | null
  declared_paid_at: string | null
  received_at: string | null
  disputed_at: string | null
  resolved_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  approved_by_user_id?: string | null
  declared_paid_by_user_id?: string | null
  external_reference?: string | null
  payment_note?: string | null
  dispute_reason?: string | null
  resolved_by_user_id?: string | null
  resolution_note?: string | null
  cancellation_reason?: string | null
}

export type PayoutSummary = {
  cycle_id: string
  currency: string
  total: number
  expected_amount: string
  available_amount: string
  pending_amount: string
  ready_amount: string
  approved_amount: string
  declared_paid_amount: string
  received_amount: string
  disputed_amount: string
  cancelled_amount: string
  counts: Partial<Record<PayoutStatus, number>>
}

export type PayoutAction =
  | { type: 'refresh-readiness' }
  | { type: 'approve'; approved_amount: string }
  | {
      type: 'declare-paid'
      external_reference: string
      payment_note?: string
    }
  | { type: 'confirm-receipt' }
  | { type: 'dispute'; reason: string }
  | { type: 'resolve-dispute'; resolution_note: string }
  | { type: 'cancel'; reason: string }

const statuses: PayoutStatus[] = [
  'pending',
  'ready',
  'approved',
  'declared_paid',
  'received',
  'disputed',
  'cancelled',
]

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isOptionalNullableString(record: Record<string, unknown>, key: string): boolean {
  return !(key in record) || isNullableString(record[key])
}

function isPayout(value: unknown): value is Payout {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.tontine_id === 'string' &&
    typeof value.cycle_id === 'string' &&
    typeof value.turn_id === 'string' &&
    typeof value.beneficiary_membership_id === 'string' &&
    typeof value.expected_amount === 'string' &&
    typeof value.available_amount === 'string' &&
    isNullableString(value.approved_amount) &&
    typeof value.currency === 'string' &&
    statuses.includes(value.status as PayoutStatus) &&
    typeof value.scheduled_for === 'string' &&
    isNullableString(value.approved_at) &&
    isNullableString(value.declared_paid_at) &&
    isNullableString(value.received_at) &&
    isNullableString(value.disputed_at) &&
    isNullableString(value.resolved_at) &&
    isNullableString(value.cancelled_at) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    isOptionalNullableString(value, 'approved_by_user_id') &&
    isOptionalNullableString(value, 'declared_paid_by_user_id') &&
    isOptionalNullableString(value, 'external_reference') &&
    isOptionalNullableString(value, 'payment_note') &&
    isOptionalNullableString(value, 'dispute_reason') &&
    isOptionalNullableString(value, 'resolved_by_user_id') &&
    isOptionalNullableString(value, 'resolution_note') &&
    isOptionalNullableString(value, 'cancellation_reason')
}

function isPayoutSummary(value: unknown): value is PayoutSummary {
  if (!isRecord(value) || !isRecord(value.counts)) return false
  const amounts = [
    'expected_amount',
    'available_amount',
    'pending_amount',
    'ready_amount',
    'approved_amount',
    'declared_paid_amount',
    'received_amount',
    'disputed_amount',
    'cancelled_amount',
  ]
  return typeof value.cycle_id === 'string' &&
    typeof value.currency === 'string' &&
    Number.isInteger(value.total) &&
    amounts.every((key) => typeof value[key] === 'string') &&
    Object.entries(value.counts).every(
      ([status, count]) => statuses.includes(status as PayoutStatus) && Number.isInteger(count),
    )
}

function payoutPath(payoutId: string, action = ''): string {
  return `/api/v1/payouts/${encodeURIComponent(payoutId)}${action ? `/${action}` : ''}`
}

async function payoutRequest(
  token: string,
  payoutId: string,
  action: PayoutAction,
): Promise<Payout> {
  const payload: Record<string, string> = {}
  if (action.type === 'approve') payload.approved_amount = action.approved_amount
  if (action.type === 'declare-paid') {
    payload.external_reference = action.external_reference
    if (action.payment_note) payload.payment_note = action.payment_note
  }
  if (action.type === 'dispute') payload.reason = action.reason
  if (action.type === 'resolve-dispute') payload.resolution_note = action.resolution_note
  if (action.type === 'cancel') payload.reason = action.reason

  const response = await apiRequest(
    token,
    payoutPath(payoutId, action.type),
    { method: 'POST', ...(Object.keys(payload).length ? { body: JSON.stringify(payload) } : {}) },
  )
  if (!isPayout(response)) throw new Error('Le versement reçu est invalide')
  return response
}

export async function listCyclePayouts(
  token: string,
  tontineId: string,
  cycleId: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<OffsetPage<Payout>> {
  const params = new URLSearchParams({ limit: '100', offset: String(offset) })
  const response = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles/${encodeURIComponent(cycleId)}/payouts?${params}`,
    { signal },
  )
  return parseOffsetPage(response, isPayout, 'La liste des versements')
}

export async function getCyclePayoutSummary(
  token: string,
  tontineId: string,
  cycleId: string,
  signal?: AbortSignal,
): Promise<PayoutSummary> {
  const response = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles/${encodeURIComponent(cycleId)}/payouts/summary`,
    { signal },
  )
  if (!isPayoutSummary(response)) throw new Error('Le récapitulatif des versements reçu est invalide')
  return response
}

export async function generateCyclePayouts(
  token: string,
  tontineId: string,
  cycleId: string,
): Promise<PayoutSummary> {
  const response = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles/${encodeURIComponent(cycleId)}/payouts/generate`,
    { method: 'POST' },
  )
  if (!isPayoutSummary(response)) throw new Error('Le récapitulatif des versements reçu est invalide')
  return response
}

export function transitionPayout(
  token: string,
  payoutId: string,
  action: PayoutAction,
): Promise<Payout> {
  return payoutRequest(token, payoutId, action)
}
