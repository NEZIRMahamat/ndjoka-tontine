import {
  Briefcase,
  GraduationCap,
  Heart,
  Home,
  ListOrdered,
  Plane,
  Shuffle,
  Star,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react'

import type { Contribution, Cycle, CycleTurn, TontineMembership } from '@/features/tontines/cycles-api'
import type { TontineCategory, TurnOrderMode } from '@/features/tontines/tontines-api'

export const cycleFrequencyLabels: Record<Cycle['frequency'], string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
}

export const frequencyShortLabels: Record<Cycle['frequency'], string> = {
  weekly: 'sem.',
  monthly: 'mois',
}

export const membershipRoleLabels: Record<TontineMembership['role'], string> = {
  owner: 'Organisateur',
  manager: 'Gestionnaire',
  treasurer: 'Trésorier',
  member: 'Participant',
}

export const contributionStatusLabels: Record<Contribution['effective_status'], string> = {
  pending: 'En attente',
  declared: 'Déclarée',
  confirmed: 'Payée',
  rejected: 'À corriger',
  cancelled: 'Annulée',
  late: 'En retard',
}

export type CategoryMeta = { label: string; icon: LucideIcon; chip: string; tile: string; image: string; gradient: string }

export const CATEGORY_META: Record<TontineCategory, CategoryMeta> = {
  business: { label: 'Business', icon: Briefcase, chip: 'bg-blue-100 text-blue-700', tile: 'bg-blue-50 text-blue-600 border-blue-200', image: 'https://images.unsplash.com/photo-1548782033-3ac3a62ece8d?auto=format&fit=crop&w=1200&q=80', gradient: 'from-blue-600 to-indigo-700' },
  family: { label: 'Famille', icon: Users, chip: 'bg-rose-100 text-rose-700', tile: 'bg-rose-50 text-rose-600 border-rose-200', image: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1200&q=80', gradient: 'from-rose-500 to-pink-700' },
  travel: { label: 'Voyage', icon: Plane, chip: 'bg-sky-100 text-sky-700', tile: 'bg-sky-50 text-sky-600 border-sky-200', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80', gradient: 'from-sky-500 to-cyan-700' },
  solidarity: { label: 'Solidarité', icon: Heart, chip: 'bg-orange-100 text-orange-700', tile: 'bg-orange-50 text-orange-600 border-orange-200', image: 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1200&q=80', gradient: 'from-orange-500 to-amber-700' },
  housing: { label: 'Immobilier', icon: Home, chip: 'bg-emerald-100 text-emerald-700', tile: 'bg-emerald-50 text-emerald-600 border-emerald-200', image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80', gradient: 'from-emerald-600 to-teal-700' },
  education: { label: 'Éducation', icon: GraduationCap, chip: 'bg-purple-100 text-purple-700', tile: 'bg-purple-50 text-purple-600 border-purple-200', image: 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=1200&q=80', gradient: 'from-purple-600 to-violet-800' },
  other: { label: 'Autre', icon: Star, chip: 'bg-slate-100 text-slate-600', tile: 'bg-slate-50 text-slate-600 border-slate-200', image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80', gradient: 'from-slate-600 to-slate-800' },
}

export const CATEGORY_ORDER: TontineCategory[] = ['business', 'family', 'travel', 'solidarity', 'housing', 'education', 'other']

export const ORDER_MODE_META: Record<TurnOrderMode, { label: string; icon: LucideIcon; description: string }> = {
  lottery: { label: 'Tirage au sort', icon: Shuffle, description: 'Ordre déterminé aléatoirement au lancement' },
  registration: { label: "Ordre d'inscription", icon: ListOrdered, description: 'Premier inscrit = premier bénéficiaire' },
  vote: { label: 'Vote du groupe', icon: Vote, description: "L'organisateur ajuste l'ordre après consultation du groupe" },
}

export function coverImageFor(category: TontineCategory, coverImageUrl: string | null): string {
  return coverImageUrl ?? CATEGORY_META[category].image
}

const contributionOrder: Contribution['effective_status'][] = ['late', 'pending', 'declared', 'rejected', 'confirmed', 'cancelled']

export function formatDate(value: string, timezone?: string | null, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('fr-FR', {
    ...(options ?? { dateStyle: 'medium' }),
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date)
}

export function formatShortDate(value: string, timezone?: string | null): string {
  return formatDate(value, timezone, { day: 'numeric', month: 'short' })
}

export function formatLongDate(value: string, timezone?: string | null): string {
  return formatDate(value, timezone, { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatMonthYear(value: string, timezone?: string | null): string {
  return formatDate(value, timezone, { month: 'long', year: 'numeric' })
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
    const delta = contributionOrder.indexOf(left.effective_status) - contributionOrder.indexOf(right.effective_status)
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
  const countOf = (status: Contribution['effective_status']) => contributions.filter((item) => item.effective_status === status).length
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

export type TurnStatus = 'completed' | 'current' | 'upcoming'

/** Le tour courant est le premier tour dont la date est dans les 30 prochains jours ou déjà passée sans être totalement réglé. */
export function turnStatusOf(turn: CycleTurn, cycle: Cycle, contributions: Contribution[], now: Date = new Date()): TurnStatus {
  const scheduled = new Date(turn.scheduled_for).getTime()
  const mine = contributions.filter((item) => item.turn_id === turn.id && item.effective_status !== 'cancelled')
  const settled = mine.length > 0 && mine.every((item) => item.effective_status === 'confirmed')
  if (cycle.status === 'completed') return 'completed'
  if (scheduled <= now.getTime()) return settled ? 'completed' : 'current'
  return 'upcoming'
}

export function currentTurnOf(cycle: Cycle, contributions: Contribution[], now: Date = new Date()): CycleTurn | undefined {
  const ordered = [...cycle.turns].sort((left, right) => left.position - right.position)
  const open = ordered.find((turn) => turnStatusOf(turn, cycle, contributions, now) === 'current')
  return open ?? ordered.find((turn) => new Date(turn.scheduled_for).getTime() >= now.getTime())
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

export function cycleProgressPercent(cycle: Cycle | undefined, contributions: Contribution[] = [], now: Date = new Date()): number {
  if (!cycle || cycle.turns.length === 0) return 0
  if (cycle.status === 'completed') return 100
  const completed = cycle.turns.filter((turn) => turnStatusOf(turn, cycle, contributions, now) === 'completed').length
  return Math.min(100, Math.round((completed / cycle.turns.length) * 100))
}

export function memberLabel(member: TontineMembership | undefined, fallback = 'Membre'): string {
  return member?.display_name?.trim() || fallback
}
