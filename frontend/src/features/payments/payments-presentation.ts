import type { Contribution, Payout } from '@/features/payments/payments-api'

export type Transaction = {
  id: string
  key: string
  type: 'in' | 'out'
  kind: 'contribution' | 'payout'
  label: string
  date: string
  amount: number
  currency: string
  status: 'Succès' | 'En attente' | 'Déclaré' | 'En retard' | 'Rejeté' | 'Annulé' | 'Contesté'
  statusTone: 'emerald' | 'amber' | 'red' | 'slate' | 'blue'
  reference: string | null
  note: string | null
  tontineId: string | null
  tontineName: string | null
  method: string
  category: string
  monthKey: string
  monthLabel: string
  raw: Contribution | Payout
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

function monthOf(value: string): { key: string; label: string } {
  const date = new Date(value)
  return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}` }
}

export function contributionToTransaction(item: Contribution): Transaction {
  const statusMap: Record<Contribution['effective_status'], [Transaction['status'], Transaction['statusTone']]> = {
    confirmed: ['Succès', 'emerald'],
    declared: ['Déclaré', 'blue'],
    pending: ['En attente', 'amber'],
    late: ['En retard', 'red'],
    rejected: ['Rejeté', 'red'],
    cancelled: ['Annulé', 'slate'],
  }
  const [status, statusTone] = statusMap[item.effective_status]
  const date = item.confirmed_at ?? item.declared_at ?? item.due_at
  const month = monthOf(date)
  return {
    id: item.id,
    key: `contribution-${item.id}`,
    type: 'out',
    kind: 'contribution',
    label: `Cotisation ${item.tontine_name ?? 'tontine'}`,
    date,
    amount: Number(item.amount_due),
    currency: item.currency ?? 'EUR',
    status,
    statusTone,
    reference: null,
    note: item.rejection_reason,
    tontineId: item.tontine_id,
    tontineName: item.tontine_name,
    method: item.effective_status === 'confirmed' ? 'Virement confirmé par le trésorier' : 'Virement à déclarer',
    category: 'Cotisation tontine',
    monthKey: month.key,
    monthLabel: month.label,
    raw: item,
  }
}

export function payoutToTransaction(item: Payout, tontineName: string | null): Transaction {
  const statusMap: Record<Payout['status'], [Transaction['status'], Transaction['statusTone']]> = {
    received: ['Succès', 'emerald'],
    declared_paid: ['Déclaré', 'blue'],
    approved: ['En attente', 'amber'],
    ready: ['En attente', 'amber'],
    pending: ['En attente', 'amber'],
    disputed: ['Contesté', 'red'],
    cancelled: ['Annulé', 'slate'],
  }
  const [status, statusTone] = statusMap[item.status]
  const date = item.received_at ?? item.scheduled_for
  const month = monthOf(date)
  return {
    id: item.id,
    key: `payout-${item.id}`,
    type: 'in',
    kind: 'payout',
    label: `Levée ${tontineName ?? 'tontine'}`,
    date,
    amount: Number(item.net_amount ?? item.approved_amount ?? item.expected_amount),
    currency: item.currency,
    status,
    statusTone,
    reference: null,
    note: item.platform_fee ? `Pot brut ${Number(item.expected_amount).toLocaleString('fr-FR')} ${item.currency}, frais Ndjoka ${Number(item.platform_fee).toLocaleString('fr-FR')} ${item.currency} déduits (dont ${Number(item.solidarity_fund_share ?? 0).toLocaleString('fr-FR')} ${item.currency} pour le fonds de solidarité).` : null,
    tontineId: item.tontine_id,
    tontineName,
    method: 'Virement du trésorier',
    category: 'Gain tontine',
    monthKey: month.key,
    monthLabel: month.label,
    raw: item,
  }
}

export function sortByDateDesc(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((left, right) => right.date.localeCompare(left.date))
}
