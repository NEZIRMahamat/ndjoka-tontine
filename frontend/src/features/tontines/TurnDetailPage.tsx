import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { AlertTriangle, ArrowLeft, CalendarClock, Coins, Loader2, Lock, Trophy, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate, useParams } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { getTontine, type Tontine } from '@/features/tontines/tontines-api'
import {
  declareContribution,
  getCycle,
  listTontineMemberships,
  membershipLabel,
  type Contribution,
  type Cycle,
  type TontineMembership,
} from '@/features/tontines/cycles-api'
import type { Payout } from '@/features/tontines/payouts-api'
import {
  isFinancialRole,
  loadAllCycleContributions,
  loadAllCyclePayouts,
  loadAllMyContributions,
} from '@/features/tontines/tontine-data'
import {
  contributionStatusLabels,
  cycleFrequencyLabels,
  deadlineLabel,
  formatDate,
  initialsOf,
  sortContributions,
  turnProgressOf,
} from '@/features/tontines/tontine-presentation'

function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, percent / 100)))}
          className={percent >= 100 ? 'stroke-emerald-500' : 'stroke-primary'}
        />
      </svg>
      <span className="absolute text-xs font-bold text-foreground">{label}</span>
    </div>
  )
}

export default function TurnDetailPage() {
  const { tontineId = '', cycleId = '', turnId = '' } = useParams()
  const { getAccessTokenSilently } = useAuth0()
  const profile = useCurrentUser()
  const navigate = useNavigate()

  const [tontine, setTontine] = useState<Tontine | null>(null)
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [memberships, setMemberships] = useState<TontineMembership[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [collectiveView, setCollectiveView] = useState(false)
  const [payout, setPayout] = useState<Payout | null>(null)
  const [payoutError, setPayoutError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [declaringId, setDeclaringId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const [loadedTontine, loadedCycle, loadedMemberships] = await Promise.all([
          getTontine(token, tontineId, controller.signal),
          getCycle(token, tontineId, cycleId, controller.signal),
          listTontineMemberships(token, tontineId, controller.signal),
        ])
        const mine = loadedMemberships.find(
          (member) => member.user_id === profile.id && member.status === 'active',
        )
        const canSeeEveryContribution = isFinancialRole(mine?.role)
        const loadedContributions = canSeeEveryContribution
          ? await loadAllCycleContributions(token, tontineId, cycleId, controller.signal)
          : (await loadAllMyContributions(token, controller.signal)).filter(
              (item) => item.cycle_id === cycleId,
            )
        if (!active) return
        setTontine(loadedTontine)
        setCycle(loadedCycle)
        setMemberships(loadedMemberships)
        setContributions(loadedContributions)
        setCollectiveView(canSeeEveryContribution)

        try {
          const payouts = await loadAllCyclePayouts(token, tontineId, cycleId, controller.signal)
          if (!active) return
          setPayout(payouts.find((item) => item.turn_id === turnId) ?? null)
          setPayoutError('')
        } catch (caught) {
          if (!active || controller.signal.aborted) return
          setPayout(null)
          setPayoutError(messageOf(caught, 'Chargement des versements impossible'))
        }
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Chargement du tour impossible'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [cycleId, getAccessTokenSilently, profile.id, reload, tontineId, turnId])

  const turn = useMemo(() => cycle?.turns.find((item) => item.id === turnId), [cycle, turnId])
  const turnContributions = useMemo(
    () => sortContributions(contributions.filter((item) => item.turn_id === turnId)),
    [contributions, turnId],
  )
  const progress = useMemo(() => turnProgressOf(turnContributions), [turnContributions])
  const myMembership = memberships.find(
    (member) => member.user_id === profile.id && member.status === 'active',
  )
  const beneficiary = memberships.find((member) => member.id === turn?.beneficiary_membership_id)
  const expectedAmount = cycle ? Number(cycle.contribution_amount) * progress.total : 0
  const isBeneficiary = Boolean(myMembership && myMembership.id === turn?.beneficiary_membership_id)

  async function declare(event: FormEvent<HTMLFormElement>, contribution: Contribution) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const token = await getAccessTokenSilently()
      await declareContribution(token, contribution.id, {
        declaration_reference: String(data.get('reference') ?? '').trim() || null,
        declaration_note: String(data.get('note') ?? '').trim() || null,
      })
      toast.success('Cotisation déclarée. Un responsable doit la confirmer.')
      setDeclaringId('')
      setReload((value) => value + 1)
    } catch (caught) {
      toast.error(messageOf(caught, 'Déclaration impossible'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !tontine || !cycle || !turn) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-12 text-center">
        <p className="text-sm text-destructive">{error || 'Ce tour est introuvable.'}</p>
        <Button variant="outline" onClick={() => navigate(`/tontines/${tontineId}`)}>
          <ArrowLeft className="h-4 w-4" /> Retour à la tontine
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button
        type="button"
        onClick={() => navigate(`/tontines/${tontineId}`)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {tontine.name}
      </button>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Cycle {cycle.sequence_number} · {cycle.name}
                </span>
                <StatusBadge status={cycle.status} />
              </div>
              <h2 className="mt-1 text-xl font-bold text-foreground">Tour {turn.position}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Bénéficiaire :{' '}
                  <b className="font-semibold text-foreground">
                    {beneficiary ? membershipLabel(beneficiary, turn.beneficiary_membership_id) : 'Membre'}
                  </b>
                </span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {formatDate(turn.scheduled_for, cycle.timezone)}
                </span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span>{cycleFrequencyLabels[cycle.frequency]}</span>
              </p>
            </div>
            {collectiveView ? (
              <ProgressRing
                percent={progress.percent}
                label={progress.total ? `${progress.confirmed}/${progress.total}` : '—'}
              />
            ) : null}
          </div>

          {collectiveView ? (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Confirmées', value: progress.confirmed },
                { label: 'En retard', value: progress.late },
                { label: 'Déclarées', value: progress.declared },
                { label: 'En attente', value: progress.pending },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-muted/50 p-3 text-center">
                  <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
                  <dd className="text-lg font-bold text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              Le suivi des cotisations de l’ensemble des membres est réservé aux responsables
              (propriétaire, gestionnaire, trésorier). Vous visualisez ici votre propre cotisation
              pour ce tour.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Coins className="h-4 w-4" />
              Cotisation :{' '}
              <b className="text-foreground">
                {formatCurrencyAmount(cycle.contribution_amount, tontine.currency)}
              </b>
            </span>
            {collectiveView ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                Cagnotte attendue :{' '}
                <b className="text-foreground">{formatCurrencyAmount(expectedAmount, tontine.currency)}</b>
              </span>
            ) : null}
          </div>

          {payoutError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {payoutError}
            </p>
          ) : null}

          {payout ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
              <div className="text-sm">
                <p className="font-semibold text-foreground">Versement du tour</p>
                <p className="text-xs text-muted-foreground">
                  Disponible {formatCurrencyAmount(payout.available_amount, payout.currency)} sur{' '}
                  {formatCurrencyAmount(payout.expected_amount, payout.currency)} · prévu le{' '}
                  {formatDate(payout.scheduled_for, cycle.timezone)}
                </p>
              </div>
              <StatusBadge status={payout.status} />
            </div>
          ) : null}

          {collectiveView && progress.total > 0 && progress.confirmed === progress.total ? (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Trophy className="h-4 w-4 shrink-0" />
              Toutes les cotisations attendues sont confirmées dans l’application. Vérifiez les fonds réellement reçus avant de déclarer un versement.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {collectiveView
              ? `Cotisations des membres (${turnContributions.length})`
              : 'Ma cotisation pour ce tour'}
          </h3>
          {turnContributions.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {collectiveView
                ? 'Aucune cotisation n’a encore été générée pour ce tour.'
                : isBeneficiary
                  ? 'Vous êtes le bénéficiaire de ce tour : aucune cotisation personnelle n’est attendue.'
                  : 'Aucune cotisation personnelle n’a encore été générée pour ce tour.'}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {turnContributions.map((contribution) => {
                const member = memberships.find((item) => item.id === contribution.membership_id)
                const name = membershipLabel(member, contribution.membership_id)
                const isSelf = contribution.membership_id === myMembership?.id
                const canDeclare =
                  isSelf &&
                  (contribution.effective_status === 'pending' ||
                    contribution.effective_status === 'late' ||
                    contribution.effective_status === 'rejected')
                return (
                  <li
                    key={contribution.id}
                    className={`rounded-lg px-3 py-3 ${isSelf ? 'bg-blue-50/70' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {initialsOf(name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <span className="truncate">{name}</span>
                          {isSelf ? (
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              Vous
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrencyAmount(contribution.amount_due, tontine.currency)} ·{' '}
                          {contribution.confirmed_at
                            ? `Confirmée le ${formatDate(contribution.confirmed_at, cycle.timezone)}`
                            : contribution.declared_at
                              ? `Déclarée le ${formatDate(contribution.declared_at, cycle.timezone)}`
                              : deadlineLabel(contribution.due_at)}
                        </p>
                      </div>
                      <StatusBadge
                        status={contribution.effective_status}
                        label={contributionStatusLabels[contribution.effective_status]}
                      />
                      {canDeclare ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDeclaringId(declaringId === contribution.id ? '' : contribution.id)
                          }
                        >
                          Déclarer
                        </Button>
                      ) : null}
                    </div>

                    {contribution.rejection_reason ? (
                      <p className="mt-2 ml-12 text-xs text-destructive">
                        Motif de rejet : {contribution.rejection_reason}
                      </p>
                    ) : null}

                    {declaringId === contribution.id ? (
                      <form onSubmit={(event) => void declare(event, contribution)} className="mt-3 ml-12 space-y-3">
                        <fieldset disabled={busy} className="space-y-3">
                          <div className="space-y-1.5">
                            <Label htmlFor={`reference-${contribution.id}`}>Référence du virement</Label>
                            <Input
                              id={`reference-${contribution.id}`}
                              name="reference"
                              maxLength={120}
                              placeholder="Ex. VIR-2026-04-12"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`note-${contribution.id}`}>Note (facultatif)</Label>
                            <Textarea id={`note-${contribution.id}`} name="note" rows={2} maxLength={500} />
                          </div>
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={busy}>
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Envoyer la déclaration
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setDeclaringId('')}>
                              Annuler
                            </Button>
                          </div>
                        </fieldset>
                      </form>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
