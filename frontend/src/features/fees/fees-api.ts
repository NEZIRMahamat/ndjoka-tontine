import { apiRequest, isRecord } from '@/lib/http'

export type FeeQuote = {
  contribution_amount: string
  members: number
  gross_amount: string
  fee_per_contribution: string
  fee_total: string
  effective_rate: string
  solidarity_fund_share: string
  platform_share: string
  net_amount: string
  payment_methods: Array<'card' | 'sepa'>
}

export type FeeTier = { label: string; rate: string; minimum: string | null; cap: string | null }
export type FeeSchedule = { tiers: FeeTier[]; solidarity_share: string; card_limit: string; notice_days: number }

function isQuote(value: unknown): value is FeeQuote {
  return isRecord(value) && typeof value.gross_amount === 'string' && typeof value.fee_total === 'string' &&
    typeof value.net_amount === 'string' && Array.isArray(value.payment_methods)
}

export async function getFeeQuote(token: string, contributionAmount: string, members: number, signal?: AbortSignal): Promise<FeeQuote> {
  const params = new URLSearchParams({ contribution_amount: contributionAmount, members: String(members) })
  const payload = await apiRequest(token, `/api/v1/fees/quote?${params}`, { signal })
  if (!isQuote(payload)) throw new Error('Le devis de frais reçu est invalide')
  return payload
}

export async function getFeeSchedule(token: string, signal?: AbortSignal): Promise<FeeSchedule> {
  const payload = await apiRequest(token, '/api/v1/fees/schedule', { signal })
  if (!isRecord(payload) || !Array.isArray(payload.tiers)) throw new Error('Le barème reçu est invalide')
  return payload as FeeSchedule
}

/** Calcul local identique au barème serveur, pour les simulations instantanées. */
export function commissionPerContribution(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (amount <= 100) return round2(amount * 0.03)
  if (amount <= 300) return round2(Math.max(amount * 0.02, 3))
  return round2(Math.min(Math.max(amount * 0.01, 6), 10))
}

export function localQuote(amount: number, members: number) {
  const feeUnit = commissionPerContribution(amount)
  const gross = round2(amount * members)
  const feeTotal = round2(feeUnit * members)
  const solidarity = round2(feeTotal / 6)
  return {
    gross,
    feeUnit,
    feeTotal,
    solidarity,
    platform: round2(feeTotal - solidarity),
    net: round2(gross - feeTotal),
    rate: gross > 0 ? (feeTotal / gross) * 100 : 0,
    sepaOnly: amount > 300,
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
