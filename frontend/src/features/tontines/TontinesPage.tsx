import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  KeyRound,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import {
  acceptInvitation,
  listTontines,
  type Tontine,
  type TontinePage,
  type TontineStatus,
} from '@/features/tontines/tontines-api'
import {
  listCycles,
  listTontineMemberships,
  membershipLabel,
  type Contribution,
  type Cycle,
  type TontineMembership,
} from '@/features/tontines/cycles-api'
import { loadAllMyContributions } from '@/features/tontines/tontine-data'
import {
  activeCycleOf,
  cycleFrequencyLabels,
  cycleProgressPercent,
  currentTurnOf,
  deadlineLabel,
  formatDate,
  initialsOf,
  membershipRoleLabels,
} from '@/features/tontines/tontine-presentation'

const PAGE_SIZE = 20

const filters: { value: TontineStatus | ''; label: string }[] = [
  { value: '', label: 'Toutes' },
  { value: 'active', label: 'Actives' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'archived', label: 'Archivées' },
]

type TontineInsight = {
  memberships: TontineMembership[]
  cycles: Cycle[]
}

type PendingAction = {
  contribution: Contribution
  tontine: Tontine
  cycle: Cycle
}

function MemberAvatars({ memberships }: { memberships: TontineMembership[] }) {
  const visible = memberships.slice(0, 4)
  return (
    <div className="flex -space-x-2">
      {visible.map((member) => (
        <span
          key={member.id}
          title={membershipLabel(member, member.id)}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-[11px] font-bold text-primary"
        >
          {initialsOf(membershipLabel(member, member.id))}
        </span>
      ))}
      {memberships.length > visible.length ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-bold text-muted-foreground">
          +{memberships.length - visible.length}
        </span>
      ) : null}
    </div>
  )
}

function TontineCard({
  tontine,
  insight,
  userId,
  onOpen,
  insightError,
}: {
  tontine: Tontine
  insight: TontineInsight | undefined
  userId: string
  onOpen: () => void
  insightError: boolean
}) {
  const memberships = insight?.memberships ?? []
  const activeMembers = memberships.filter((member) => member.status === 'active')
  const myMembership = activeMembers.find((member) => member.user_id === userId)
  const cycle = insight ? activeCycleOf(insight.cycles) : undefined
  const currentTurn = cycle ? currentTurnOf(cycle) : undefined
  const myTurn = cycle?.turns.find((turn) => turn.beneficiary_membership_id === myMembership?.id)
  const progress = cycleProgressPercent(cycle)

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40 hover:shadow-md">
      <div className="flex-1 space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-foreground">{tontine.name}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {insight ? `${activeMembers.length} membre${activeMembers.length > 1 ? 's' : ''}` : '—'}
              </span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{cycle ? cycleFrequencyLabels[cycle.frequency] : 'Aucun cycle'}</span>
            </p>
          </div>
          <StatusBadge status={tontine.status} />
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-[11px] text-muted-foreground">Cotisation</dt>
            <dd className="mt-0.5 truncate text-sm font-bold text-foreground">
              {cycle ? formatCurrencyAmount(cycle.contribution_amount, tontine.currency) : '—'}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-[11px] text-muted-foreground">Tour actuel</dt>
            <dd className="mt-0.5 truncate text-sm font-bold text-primary">
              {cycle && currentTurn ? `Tour ${currentTurn.position}/${cycle.turns.length}` : '—'}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-[11px] text-muted-foreground">Mon tour</dt>
            <dd className="mt-0.5 truncate text-sm font-bold text-foreground">
              {myTurn ? `Tour ${myTurn.position}` : '—'}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-[11px] text-muted-foreground">Rôle</dt>
            <dd className="mt-0.5 truncate text-sm font-bold text-foreground">
              {myMembership ? membershipRoleLabels[myMembership.role] : '—'}
            </dd>
          </div>
        </dl>

        {cycle ? (
          <div>
            <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>Progression du cycle « {cycle.name} »</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            {currentTurn ? (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                Prochaine échéance {formatDate(currentTurn.scheduled_for, cycle.timezone)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {tontine.description ?? 'Aucun cycle planifié pour le moment.'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3">
        {insight ? <MemberAvatars memberships={activeMembers} /> : insightError ? <span className="text-xs text-destructive">Informations indisponibles</span> : <Skeleton className="h-8 w-24" />}
        <Button variant="ghost" size="sm" className="text-primary" onClick={onOpen}>
          Voir les tours <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </article>
  )
}

export default function TontinesPage() {
  const { getAccessTokenSilently } = useAuth0()
  const profile = useCurrentUser()
  const navigate = useNavigate()
  const [page, setPage] = useState<TontinePage | null>(null)
  const [offset, setOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState<TontineStatus | ''>('')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [insights, setInsights] = useState<Record<string, TontineInsight>>({})
  const [myContributions, setMyContributions] = useState<Contribution[]>([])
  const [insightError, setInsightError] = useState('')
  const [contributionsError, setContributionsError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const result = await listTontines(token, offset, controller.signal, statusFilter || undefined)
        if (active) setPage(result)
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Chargement impossible'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, offset, reload, statusFilter])

  useEffect(() => {
    if (!page || page.items.length === 0) {
      setInsights({})
      setInsightError('')
      return
    }
    const controller = new AbortController()
    let active = true
    void (async () => {
      setInsightError('')
      setInsights({})
      try {
        const token = await getAccessTokenSilently()
        const entries = await Promise.all(
          page.items.map(async (tontine) => {
            const [memberships, cycles] = await Promise.all([
              listTontineMemberships(token, tontine.id, controller.signal),
              listCycles(token, tontine.id, 0, controller.signal).then((result) => result.items),
            ])
            return [tontine.id, { memberships, cycles }] as const
          }),
        )
        if (active) setInsights(Object.fromEntries(entries))
      } catch (caught) {
        if (active && !controller.signal.aborted) setInsightError(messageOf(caught, 'Impossible de charger les détails des tontines.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, page])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setContributionsError('')
      try {
        const token = await getAccessTokenSilently()
        const items = await loadAllMyContributions(token, controller.signal)
        if (active) setMyContributions(items)
      } catch (caught) {
        if (active && !controller.signal.aborted) {
          setMyContributions([])
          setContributionsError(messageOf(caught, 'Impossible de charger vos cotisations.'))
        }
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload])

  const pendingActions = useMemo<PendingAction[]>(() => {
    if (!page) return []
    const cycleIndex = new Map<string, { tontine: Tontine; cycle: Cycle }>()
    for (const tontine of page.items) {
      for (const cycle of insights[tontine.id]?.cycles ?? []) {
        cycleIndex.set(cycle.id, { tontine, cycle })
      }
    }
    return myContributions
      .filter((item) => item.effective_status === 'late' || item.effective_status === 'pending')
      .map((contribution) => {
        const match = cycleIndex.get(contribution.cycle_id)
        return match ? { contribution, tontine: match.tontine, cycle: match.cycle } : null
      })
      .filter((item): item is PendingAction => item !== null)
      .sort((left, right) => left.contribution.due_at.localeCompare(right.contribution.due_at))
  }, [insights, myContributions, page])

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const invitationToken = String(new FormData(form).get('token')).trim()
    setJoining(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      await acceptInvitation(token, invitationToken)
      form.reset()
      setOffset(0)
      setReload((value) => value + 1)
      toast.success('Invitation acceptée. La tontine apparaît maintenant dans votre liste.')
    } catch (caught) {
      setError(messageOf(caught, "Impossible d'accepter l'invitation"))
    } finally {
      setJoining(false)
    }
  }

  const urgent = pendingActions[0]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Vos groupes</p>
          <h2 className="mt-1 text-2xl font-bold text-foreground">Mes Tontines</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Retrouvez vos groupes, suivez les tours et gardez une vue claire sur vos cotisations.
          </p>
        </div>
        <Button onClick={() => navigate('/tontines/create')}>
          <Plus className="h-4 w-4" /> Créer une tontine
        </Button>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {insightError && <p role="alert" className="text-sm text-destructive">{insightError}</p>}
      {contributionsError && <p role="alert" className="text-sm text-destructive">{contributionsError}</p>}

      {urgent ? (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-amber-900">
              {pendingActions.length > 1
                ? `${pendingActions.length} cotisations à régulariser`
                : 'Cotisation à régulariser'}
            </h3>
            <p className="mt-1 text-sm text-amber-800">
              Cotisation de{' '}
              <b>{formatCurrencyAmount(urgent.contribution.amount_due, urgent.tontine.currency)}</b> pour «{' '}
              {urgent.tontine.name} » — {deadlineLabel(urgent.contribution.due_at)} (échéance{' '}
              {formatDate(urgent.contribution.due_at, urgent.cycle.timezone)}).
            </p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              navigate(
                `/tontines/${urgent.tontine.id}/cycles/${urgent.cycle.id}/turns/${urgent.contribution.turn_id}`,
              )
            }
          >
            Voir ma cotisation <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <Button
                  key={filter.label}
                  size="sm"
                  variant={statusFilter === filter.value ? 'default' : 'outline'}
                  onClick={() => {
                    setStatusFilter(filter.value)
                    setOffset(0)
                  }}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={loading} onClick={() => setReload((value) => value + 1)}>
              <RefreshCw className="h-4 w-4" /> Actualiser
            </Button>
          </div>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : page && page.total === 0 ? (
            <EmptyState
              icon={Users}
              title="Votre première tontine vous attend"
              description="Créez-en une ou acceptez l’invitation d’un proche pour démarrer."
              action={
                <Button onClick={() => navigate('/tontines/create')}>
                  <Plus className="h-4 w-4" /> Créer une tontine
                </Button>
              }
            />
          ) : page ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {page.items.map((item) => (
                  <TontineCard
                    key={item.id}
                    tontine={item}
                    insight={insights[item.id]}
                    userId={profile.id}
                    insightError={Boolean(insightError)}
                    onOpen={() => navigate(`/tontines/${item.id}`)}
                  />
                ))}
              </div>
              <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Précédent
                </Button>
                <span>
                  {page.total} tontine{page.total > 1 ? 's' : ''}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= page.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Suivant
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h3 className="font-semibold text-emerald-950">Rejoindre une tontine ?</h3>
          <p className="mt-1 text-sm text-emerald-800">
            Explorez les groupes ouverts et trouvez celui qui correspond à votre projet.
          </p>
        </div>
        <Button
          className="shrink-0 bg-emerald-700 text-white hover:bg-emerald-800"
          onClick={() => navigate('/explorer')}
        >
          Explorer les tontines <ArrowRight className="h-4 w-4" />
        </Button>
      </section>

      <details className="group rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-ai/10 text-accent-ai">
            <KeyRound className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-foreground">J’ai reçu une invitation</span>
            <span className="block text-xs text-muted-foreground">Collez le token transmis par le responsable</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <form onSubmit={accept} className="space-y-4 border-t border-border px-5 py-4">
          <fieldset disabled={joining} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invitation-token">Token d’invitation</Label>
              <Input
                id="invitation-token"
                name="token"
                required
                minLength={32}
                autoComplete="off"
                placeholder="Token confidentiel…"
              />
            </div>
            <Button type="submit" className="w-full">
              Rejoindre la tontine
            </Button>
          </fieldset>
        </form>
      </details>
    </div>
  )
}
