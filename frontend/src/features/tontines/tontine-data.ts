import {
  listCycleContributions,
  listCycles,
  listMyContributions,
  listTontineMemberships,
  type Contribution,
  type Cycle,
  type TontineMembership,
} from '@/features/tontines/cycles-api'
import { listCyclePayouts, type Payout } from '@/features/tontines/payouts-api'
import { activeCycleOf } from '@/features/tontines/tontine-presentation'
import { listTontines, type Tontine } from '@/features/tontines/tontines-api'

const financialRoles: TontineMembership['role'][] = ['owner', 'manager', 'treasurer']
const managementRoles: TontineMembership['role'][] = ['owner', 'manager']

export function isFinancialRole(role: TontineMembership['role'] | undefined): boolean {
  return role !== undefined && financialRoles.includes(role)
}

export function isManagementRole(role: TontineMembership['role'] | undefined): boolean {
  return role !== undefined && managementRoles.includes(role)
}

async function collectPages<T>(
  load: (offset: number) => Promise<{ items: T[]; total: number; limit: number }>,
): Promise<T[]> {
  const first = await load(0)
  const items = [...first.items]
  if (first.limit <= 0) throw new Error('Pagination invalide reçue du serveur')
  for (let offset = first.limit; offset < first.total; offset += first.limit) {
    const page = await load(offset)
    if (page.items.length === 0) throw new Error('Page de résultats vide avant la fin de la liste')
    items.push(...page.items)
  }
  return items
}

export function loadAllCycleContributions(token: string, tontineId: string, cycleId: string, signal?: AbortSignal): Promise<Contribution[]> {
  return collectPages((offset) => listCycleContributions(token, tontineId, cycleId, offset, signal))
}

export function loadAllMyContributions(token: string, signal?: AbortSignal): Promise<Contribution[]> {
  return collectPages((offset) => listMyContributions(token, offset, signal))
}

export function loadAllCyclePayouts(token: string, tontineId: string, cycleId: string, signal?: AbortSignal): Promise<Payout[]> {
  return collectPages((offset) => listCyclePayouts(token, tontineId, cycleId, offset, signal))
}

export function loadAllMyTontines(token: string, signal?: AbortSignal): Promise<Tontine[]> {
  return collectPages((offset) => listTontines(token, offset, signal))
}

export type TontineOverview = {
  tontine: Tontine
  members: TontineMembership[]
  cycles: Cycle[]
  cycle: Cycle | undefined
  contributions: Contribution[]
  payouts: Payout[]
}

/** Charge tout ce qu'une fiche tontine affiche : membres, cycle de référence, cotisations et versements. */
export async function loadTontineOverview(token: string, tontine: Tontine, signal?: AbortSignal): Promise<TontineOverview> {
  const [members, cyclesPage] = await Promise.all([
    listTontineMemberships(token, tontine.id, signal),
    listCycles(token, tontine.id, 0, signal),
  ])
  const cycles = cyclesPage.items
  const cycle = activeCycleOf(cycles)
  const hasObligations = cycle !== undefined && ['active', 'completed'].includes(cycle.status)
  const [contributions, payouts] = hasObligations && cycle
    ? await Promise.all([
        loadAllCycleContributions(token, tontine.id, cycle.id, signal),
        loadAllCyclePayouts(token, tontine.id, cycle.id, signal).catch(() => [] as Payout[]),
      ])
    : [[], []]
  return { tontine, members, cycles, cycle, contributions, payouts }
}

export async function loadMyTontineOverviews(token: string, signal?: AbortSignal): Promise<TontineOverview[]> {
  const tontines = await loadAllMyTontines(token, signal)
  return Promise.all(tontines.map((tontine) => loadTontineOverview(token, tontine, signal)))
}

export function membershipOfUser(overview: TontineOverview, userId: string): TontineMembership | undefined {
  return overview.members.find((member) => member.user_id === userId && member.status === 'active')
}
