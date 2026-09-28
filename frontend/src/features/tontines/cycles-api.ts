import {
  apiRequest,
  isRecord,
  parseOffsetPage,
  type OffsetPage,
} from '@/lib/http'

export type MembershipRole = 'owner' | 'manager' | 'treasurer' | 'member'
export type CycleFrequency = 'weekly' | 'monthly'
export type CycleStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled'
export type ContributionStatus = 'pending' | 'declared' | 'confirmed' | 'rejected' | 'cancelled'
export type EffectiveContributionStatus =
  | ContributionStatus
  | 'late'

export type CycleTurn = {
  id: string
  cycle_id: string
  position: number
  beneficiary_membership_id: string
  scheduled_for: string
  created_at: string
  updated_at: string
}

export type Cycle = {
  id: string
  tontine_id: string
  sequence_number: number
  name: string
  contribution_amount: string
  frequency: CycleFrequency
  start_date: string
  timezone: string
  beneficiary_contributes: boolean
  status: CycleStatus
  created_by_user_id: string
  activated_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  turns: CycleTurn[]
}

export type CycleInput = {
  name: string
  contribution_amount: string
  frequency: CycleFrequency
  start_date: string
  timezone: string
  beneficiary_contributes: boolean
}

export type CycleUpdateInput = Partial<CycleInput>

export type Contribution = {
  id: string
  cycle_id: string
  turn_id: string
  membership_id: string
  amount_due: string
  status: ContributionStatus
  effective_status: EffectiveContributionStatus
  due_at: string
  declared_at: string | null
  declaration_reference: string | null
  declaration_note: string | null
  confirmed_at: string | null
  confirmed_by_user_id: string | null
  rejected_at: string | null
  rejected_by_user_id: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export type ContributionSummary = {
  cycle_id: string
  obligations_total: number
  expected_amount: string
  declared_amount: string
  confirmed_amount: string
  late_amount: string
  pending_count: number
  declared_count: number
  confirmed_count: number
  rejected_count: number
  late_count: number
  cancelled_count: number
}

export type TontineMembership = {
  id: string
  tontine_id: string
  user_id: string
  display_name: string | null
  role: MembershipRole
  status: 'active' | 'left' | 'removed'
  joined_at: string
  updated_at: string
  ended_at: string | null
}

const cycleStatuses: CycleStatus[] = ['draft', 'scheduled', 'active', 'completed', 'cancelled']
const contributionStatuses: ContributionStatus[] = [
  'pending',
  'declared',
  'confirmed',
  'rejected',
  'cancelled',
]
const effectiveContributionStatuses: EffectiveContributionStatus[] = [
  ...contributionStatuses,
  'late',
]
const membershipRoles: MembershipRole[] = ['owner', 'manager', 'treasurer', 'member']

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isCycleTurn(value: unknown): value is CycleTurn {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.cycle_id === 'string' &&
    Number.isInteger(value.position) &&
    typeof value.beneficiary_membership_id === 'string' &&
    typeof value.scheduled_for === 'string' &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
}

export function isCycle(value: unknown): value is Cycle {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.tontine_id === 'string' &&
    Number.isInteger(value.sequence_number) &&
    typeof value.name === 'string' &&
    typeof value.contribution_amount === 'string' &&
    (value.frequency === 'weekly' || value.frequency === 'monthly') &&
    typeof value.start_date === 'string' &&
    typeof value.timezone === 'string' &&
    typeof value.beneficiary_contributes === 'boolean' &&
    cycleStatuses.includes(value.status as CycleStatus) &&
    typeof value.created_by_user_id === 'string' &&
    isNullableString(value.activated_at) &&
    isNullableString(value.completed_at) &&
    isNullableString(value.cancelled_at) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    Array.isArray(value.turns) &&
    value.turns.every(isCycleTurn)
}

export function isContribution(value: unknown): value is Contribution {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.cycle_id === 'string' &&
    typeof value.turn_id === 'string' &&
    typeof value.membership_id === 'string' &&
    typeof value.amount_due === 'string' &&
    contributionStatuses.includes(value.status as ContributionStatus) &&
    effectiveContributionStatuses.includes(value.effective_status as EffectiveContributionStatus) &&
    typeof value.due_at === 'string' &&
    isNullableString(value.declared_at) &&
    isNullableString(value.declaration_reference) &&
    isNullableString(value.declaration_note) &&
    isNullableString(value.confirmed_at) &&
    isNullableString(value.confirmed_by_user_id) &&
    isNullableString(value.rejected_at) &&
    isNullableString(value.rejected_by_user_id) &&
    isNullableString(value.rejection_reason) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
}

export function isContributionSummary(value: unknown): value is ContributionSummary {
  return isRecord(value) &&
    typeof value.cycle_id === 'string' &&
    Number.isInteger(value.obligations_total) &&
    typeof value.expected_amount === 'string' &&
    typeof value.declared_amount === 'string' &&
    typeof value.confirmed_amount === 'string' &&
    typeof value.late_amount === 'string' &&
    Number.isInteger(value.pending_count) &&
    Number.isInteger(value.declared_count) &&
    Number.isInteger(value.confirmed_count) &&
    Number.isInteger(value.rejected_count) &&
    Number.isInteger(value.late_count) &&
    Number.isInteger(value.cancelled_count)
}

export function isTontineMembership(value: unknown): value is TontineMembership {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.tontine_id === 'string' &&
    typeof value.user_id === 'string' &&
    (value.display_name === undefined || isNullableString(value.display_name)) &&
    membershipRoles.includes(value.role as MembershipRole) &&
    ['active', 'left', 'removed'].includes(String(value.status)) &&
    typeof value.joined_at === 'string' &&
    typeof value.updated_at === 'string' &&
    isNullableString(value.ended_at)
}

export function membershipLabel(
  membership: TontineMembership | undefined,
  membershipId: string,
): string {
  return membership?.display_name ?? `Membre ${membershipId.slice(0, 8)}…`
}

function isContributionPage(value: unknown): value is OffsetPage<Contribution> {
  return isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isContribution) &&
    typeof value.total === 'number' &&
    typeof value.limit === 'number' &&
    typeof value.offset === 'number'
}

async function cycleAction(
  token: string,
  tontineId: string,
  cycleId: string,
  action: 'turns/generate' | 'schedule' | 'activate' | 'launch' | 'complete' | 'cancel',
): Promise<Cycle> {
  const payload = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles/${encodeURIComponent(cycleId)}/${action}`,
    { method: 'POST' },
  )
  if (!isCycle(payload)) throw new Error('Le cycle reçu est invalide')
  return payload
}

export async function listCycles(
  token: string,
  tontineId: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<OffsetPage<Cycle>> {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) })
  const payload = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles?${params}`,
    { signal },
  )
  return parseOffsetPage(payload, isCycle, 'La liste des cycles')
}

export async function createCycle(token: string, tontineId: string, input: CycleInput): Promise<Cycle> {
  const payload = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  if (!isCycle(payload)) throw new Error('Le cycle reçu est invalide')
  return payload
}

export async function updateCycle(
  token: string,
  tontineId: string,
  cycleId: string,
  input: CycleUpdateInput,
): Promise<Cycle> {
  if (Object.keys(input).length === 0) throw new Error('Au moins un champ doit être modifié')
  const payload = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles/${encodeURIComponent(cycleId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  if (!isCycle(payload)) throw new Error('Le cycle reçu est invalide')
  return payload
}

export async function getCycle(
  token: string,
  tontineId: string,
  cycleId: string,
  signal?: AbortSignal,
): Promise<Cycle> {
  const payload = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles/${encodeURIComponent(cycleId)}`,
    { signal },
  )
  if (!isCycle(payload)) throw new Error('Le cycle reçu est invalide')
  return payload
}

export function generateCycleTurns(token: string, tontineId: string, cycleId: string) {
  return cycleAction(token, tontineId, cycleId, 'turns/generate')
}

export async function reorderCycleTurns(
  token: string,
  tontineId: string,
  cycleId: string,
  membershipIds: string[],
): Promise<Cycle> {
  const payload = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles/${encodeURIComponent(cycleId)}/turns`,
    { method: 'PUT', body: JSON.stringify({ membership_ids: membershipIds }) },
  )
  if (!isCycle(payload)) throw new Error('Le cycle reçu est invalide')
  return payload
}

/** Ordre des tours selon la règle du groupe, planification et activation en une étape. */
export function launchCycle(token: string, tontineId: string, cycleId: string) {
  return cycleAction(token, tontineId, cycleId, 'launch')
}

export function scheduleCycle(token: string, tontineId: string, cycleId: string) {
  return cycleAction(token, tontineId, cycleId, 'schedule')
}

export function activateCycle(token: string, tontineId: string, cycleId: string) {
  return cycleAction(token, tontineId, cycleId, 'activate')
}

export function completeCycle(token: string, tontineId: string, cycleId: string) {
  return cycleAction(token, tontineId, cycleId, 'complete')
}

export function cancelCycle(token: string, tontineId: string, cycleId: string) {
  return cycleAction(token, tontineId, cycleId, 'cancel')
}

export async function generateExpectedContributions(
  token: string,
  tontineId: string,
  cycleId: string,
): Promise<ContributionSummary> {
  const payload = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles/${encodeURIComponent(cycleId)}/contributions/generate`,
    { method: 'POST' },
  )
  if (!isContributionSummary(payload)) throw new Error('Le récapitulatif des cotisations reçu est invalide')
  return payload
}

export async function listCycleContributions(
  token: string,
  tontineId: string,
  cycleId: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<OffsetPage<Contribution>> {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) })
  const payload = await apiRequest(
    token,
    `/api/v1/tontines/${encodeURIComponent(tontineId)}/cycles/${encodeURIComponent(cycleId)}/contributions?${params}`,
    { signal },
  )
  if (!isContributionPage(payload)) throw new Error('La liste des cotisations reçue est invalide')
  return payload
}

export async function listMyContributions(
  token: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<OffsetPage<Contribution>> {
  const params = new URLSearchParams({ limit: '100', offset: String(offset) })
  const payload = await apiRequest(token, `/api/v1/me/contributions?${params}`, { signal })
  if (!isContributionPage(payload)) throw new Error('La liste de mes cotisations reçue est invalide')
  return payload
}

export async function listTontineMemberships(
  token: string,
  tontineId: string,
  signal?: AbortSignal,
): Promise<TontineMembership[]> {
  const first = parseOffsetPage(
    await apiRequest(
      token,
      `/api/v1/tontines/${encodeURIComponent(tontineId)}/members?limit=100&offset=0`,
      { signal },
    ),
    isTontineMembership,
    'La liste des membres',
  )
  const members = [...first.items]
  for (let offset = first.limit; offset < first.total; offset += first.limit) {
    const page = parseOffsetPage(
      await apiRequest(
        token,
        `/api/v1/tontines/${encodeURIComponent(tontineId)}/members?limit=100&offset=${offset}`,
        { signal },
      ),
      isTontineMembership,
      'La liste des membres',
    )
    members.push(...page.items)
  }
  return members.map((member) => ({ ...member, display_name: member.display_name ?? null }))
}

export async function declareContribution(
  token: string,
  contributionId: string,
  declaration: { declaration_reference?: string | null; declaration_note?: string | null },
): Promise<Contribution> {
  const payload = await apiRequest(
    token,
    `/api/v1/contributions/${encodeURIComponent(contributionId)}/declare`,
    { method: 'POST', body: JSON.stringify(declaration) },
  )
  if (!isContribution(payload)) throw new Error('La cotisation reçue est invalide')
  return payload
}

export async function confirmContribution(token: string, contributionId: string): Promise<Contribution> {
  const payload = await apiRequest(
    token,
    `/api/v1/contributions/${encodeURIComponent(contributionId)}/confirm`,
    { method: 'POST' },
  )
  if (!isContribution(payload)) throw new Error('La cotisation reçue est invalide')
  return payload
}

export async function rejectContribution(
  token: string,
  contributionId: string,
  reason: string,
): Promise<Contribution> {
  const payload = await apiRequest(
    token,
    `/api/v1/contributions/${encodeURIComponent(contributionId)}/reject`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  )
  if (!isContribution(payload)) throw new Error('La cotisation reçue est invalide')
  return payload
}
