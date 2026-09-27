import type { Contribution, Cycle, CycleTurn, TontineMembership } from '@/features/tontines/cycles-api'

export const cycleFrequencyLabels: Record<Cycle['frequency'], string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
}

export const membershipRoleLabels: Record<TontineMembership['role'], string> = {
  owner: 'Propriétaire',
  manager: 'Gestionnaire',
  treasurer: 'Trésorier',
  member: 'Membre',
}

export const contributionStatusLabels: Record<Contribution['effective_status'], string> = {
  pending: 'En attente',
  declared: 'Déclarée',
  confirmed: 'Confirmée',
  rejected: 'Rejetée',
  cancelled: 'Annulée',
  late: 'En retard',
}

const contributionOrder: Contribution['effective_status'][] = [
  'late',
  'pending',
  'declared',
  'rejected',
  'confirmed',
  'cancelled',
]

export function formatDate(value: string, timezone?: string | null): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date)
}

export function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function daysUntil(value: string, now: Date = new Date()): number {
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return Number.NaN
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
}

export function deadlineLabel(value: string, now: Date = new Date()): string {
  const days = daysUntil(value, now)
  if (Number.isNaN(days)) return ''
  if (days < 0) return `En retard de ${Math.abs(days)} j`
  if (days === 0) return "Échéance aujourd'hui"
  if (days === 1) return 'Échéance demain'
  return `Dans ${days} jours`
}

export function sortContributions(contributions: Contribution[]): Contribution[] {
  return [...contributions].sort((left, right) => {
    const delta =
      contributionOrder.indexOf(left.effective_status) - contributionOrder.indexOf(right.effective_status)
    if (delta !== 0) return delta
    return left.due_at.localeCompare(right.due_at)
  })
}

export type TurnProgress = {
  total: number
  confirmed: number
  declared: number
  late: number
  pending: number
  rejected: number
  percent: number
}

export function turnProgressOf(contributions: Contribution[]): TurnProgress {
  const total = contributions.filter((item) => item.effective_status !== 'cancelled').length
  const countOf = (status: Contribution['effective_status']) =>
    contributions.filter((item) => item.effective_status === status).length
  const confirmed = countOf('confirmed')
  return {
    total,
    confirmed,
    declared: countOf('declared'),
    late: countOf('late'),
    pending: countOf('pending'),
    rejected: countOf('rejected'),
    percent: total === 0 ? 0 : Math.round((confirmed / total) * 100),
  }
}

export function currentTurnOf(cycle: Cycle, now: Date = new Date()): CycleTurn | undefined {
  const ordered = [...cycle.turns].sort((left, right) => left.position - right.position)
  return ordered.find((turn) => new Date(turn.scheduled_for).getTime() >= now.getTime())
}

export function activeCycleOf(cycles: Cycle[]): Cycle | undefined {
  const byRecency = [...cycles].sort((left, right) => right.sequence_number - left.sequence_number)
  return (
    byRecency.find((cycle) => cycle.status === 'active') ??
    byRecency.find((cycle) => cycle.status === 'scheduled') ??
    byRecency.find((cycle) => cycle.status === 'draft') ??
    byRecency[0]
  )
}

export function cycleProgressPercent(cycle: Cycle | undefined, now: Date = new Date()): number {
  if (!cycle || cycle.turns.length === 0) return 0
  if (cycle.status === 'completed') return 100
  const past = cycle.turns.filter((turn) => new Date(turn.scheduled_for).getTime() < now.getTime()).length
  return Math.min(100, Math.round((past / cycle.turns.length) * 100))
}
