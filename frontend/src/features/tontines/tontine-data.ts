import {
  listCycleContributions,
  listMyContributions,
  type Contribution,
  type TontineMembership,
} from '@/features/tontines/cycles-api'
import { listCyclePayouts, type Payout } from '@/features/tontines/payouts-api'

const financialRoles: TontineMembership['role'][] = ['owner', 'manager', 'treasurer']

export function isFinancialRole(role: TontineMembership['role'] | undefined): boolean {
  return role !== undefined && financialRoles.includes(role)
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

/** Requires a financial role (owner, manager, treasurer): the API answers 403 otherwise. */
export function loadAllCycleContributions(
  token: string,
  tontineId: string,
  cycleId: string,
  signal?: AbortSignal,
): Promise<Contribution[]> {
  return collectPages((offset) => listCycleContributions(token, tontineId, cycleId, offset, signal))
}

export function loadAllMyContributions(token: string, signal?: AbortSignal): Promise<Contribution[]> {
  return collectPages((offset) => listMyContributions(token, offset, signal))
}

export function loadAllCyclePayouts(
  token: string,
  tontineId: string,
  cycleId: string,
  signal?: AbortSignal,
): Promise<Payout[]> {
  return collectPages((offset) => listCyclePayouts(token, tontineId, cycleId, offset, signal))
}
