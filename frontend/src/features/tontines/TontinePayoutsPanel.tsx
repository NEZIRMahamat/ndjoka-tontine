import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/app/current-user-context'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  listCycles,
  listTontineMemberships,
  membershipLabel,
  type Cycle,
  type TontineMembership,
} from '@/features/tontines/cycles-api'
import {
  generateCyclePayouts,
  getCyclePayoutSummary,
  listCyclePayouts,
  transitionPayout,
  type Payout,
  type PayoutAction,
  type PayoutStatus,
  type PayoutSummary,
} from '@/features/tontines/payouts-api'
import { messageOf } from '@/lib/http'

export type TontinePayoutsPanelProps = {
  tontineId: string
  currency: string
  canManage: boolean
  isArchived: boolean
}

const payoutStatusLabels: Record<PayoutStatus, string> = {
  pending: 'En attente',
  ready: 'Éligible',
  approved: 'Approuvé',
  declared_paid: 'Transfert déclaré',
  received: 'Réception confirmée',
  disputed: 'Contesté',
  cancelled: 'Annulé',
}

function formatAmount(amount: string, currency: string): string {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) return `${amount} ${currency}`
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount)} ${currency}`
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date)
}

function activeMembership(
  memberships: TontineMembership[],
  userId: string,
): TontineMembership | undefined {
  return memberships.find(
    (membership) => membership.user_id === userId && membership.status === 'active',
  )
}

function isUnpaid(status: PayoutStatus): boolean {
  return status === 'pending' || status === 'ready' || status === 'approved'
}

function SummaryMetric({
  label,
  amount,
  currency,
}: {
  label: string
  amount: string
  currency: string
}) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{formatAmount(amount, currency)}</p>
    </div>
  )
}

function PayoutCard({
  payout,
  beneficiaryLabel,
  canRefresh,
  canApprove,
  canDeclarePaid,
  canActAsBeneficiary,
  canResolve,
  canCancel,
  disabled,
  onAction,
}: {
  payout: Payout
  beneficiaryLabel: string
  canRefresh: boolean
  canApprove: boolean
  canDeclarePaid: boolean
  canActAsBeneficiary: boolean
  canResolve: boolean
  canCancel: boolean
  disabled: boolean
  onAction: (action: PayoutAction) => Promise<boolean>
}) {
  const [openForm, setOpenForm] = useState<'declare' | 'dispute' | 'resolve' | 'cancel' | null>(null)
  const [reference, setReference] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [reason, setReason] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const perform = async (action: PayoutAction) => {
    setSubmitting(true)
    try {
      if (await onAction(action)) {
        setOpenForm(null)
        setReference('')
        setPaymentNote('')
        setReason('')
        setResolutionNote('')
      }
    } catch {
      // The panel reports operation errors; keep the form open so its contents can be corrected.
    } finally {
      setSubmitting(false)
    }
  }

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (openForm === 'declare') {
      void perform({
        type: 'declare-paid',
        external_reference: reference.trim(),
        ...(paymentNote.trim() ? { payment_note: paymentNote.trim() } : {}),
      })
    } else if (openForm === 'dispute') {
      void perform({ type: 'dispute', reason: reason.trim() })
    } else if (openForm === 'resolve') {
      void perform({ type: 'resolve-dispute', resolution_note: resolutionNote.trim() })
    } else if (openForm === 'cancel') {
      void perform({ type: 'cancel', reason: reason.trim() })
    }
  }

  const actionButton = (
    label: string,
    icon: typeof RefreshCw,
    callback: () => void,
    variant: 'default' | 'outline' | 'destructive' = 'outline',
  ) => {
    const Icon = icon
    return (
      <Button
        key={label}
        type="button"
        size="sm"
        variant={variant}
        disabled={disabled || submitting}
        onClick={callback}
      >
        <Icon aria-hidden="true" />
        {label}
      </Button>
    )
  }

  const toggleForm = (form: NonNullable<typeof openForm>) => {
    setOpenForm((current) => (current === form ? null : form))
    setReason('')
    setReference('')
    setPaymentNote('')
    setResolutionNote('')
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            Versement · {beneficiaryLabel}
            <StatusBadge status={payout.status} label={payoutStatusLabels[payout.status]} />
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Échéance : {formatDate(payout.scheduled_for)}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xl font-semibold">{formatAmount(payout.expected_amount, payout.currency)}</p>
          <p className="text-xs text-muted-foreground">Montant attendu</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Disponible</dt>
            <dd className="font-medium">{formatAmount(payout.available_amount, payout.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Approuvé</dt>
            <dd className="font-medium">
              {payout.approved_amount
                ? formatAmount(payout.approved_amount, payout.currency)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Transfert déclaré</dt>
            <dd className="font-medium">{formatDate(payout.declared_paid_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Réception</dt>
            <dd className="font-medium">{formatDate(payout.received_at)}</dd>
          </div>
        </dl>

        {payout.external_reference ? (
          <p className="text-sm">
            Référence du transfert : <span className="font-medium">{payout.external_reference}</span>
          </p>
        ) : null}
        {payout.payment_note ? (
          <p className="text-sm text-muted-foreground">Note : {payout.payment_note}</p>
        ) : null}
        {payout.dispute_reason ? (
          <p className="rounded-md bg-destructive/5 p-3 text-sm">
            Motif de contestation : {payout.dispute_reason}
          </p>
        ) : null}
        {payout.resolution_note ? (
          <p className="text-sm text-muted-foreground">Résolution : {payout.resolution_note}</p>
        ) : null}
        {payout.cancellation_reason ? (
          <p className="text-sm text-muted-foreground">Motif d’annulation : {payout.cancellation_reason}</p>
        ) : null}

        {!disabled && (
          <div className="flex flex-wrap gap-2">
            {canRefresh && (payout.status === 'pending' || payout.status === 'ready') &&
              actionButton('Recalculer l’éligibilité', RefreshCw, () =>
                void perform({ type: 'refresh-readiness' }),
              )}
            {canApprove && payout.status === 'ready' &&
              actionButton('Approuver le montant total', ShieldCheck, () =>
                void perform({ type: 'approve', approved_amount: payout.expected_amount }),
              )}
            {canDeclarePaid && payout.status === 'approved' &&
              actionButton('Déclarer un transfert manuel', Banknote, () => toggleForm('declare'))}
            {canActAsBeneficiary && payout.status === 'declared_paid' && (
              <>
                {actionButton('Confirmer la réception', Check, () =>
                  void perform({ type: 'confirm-receipt' }),
                  'default',
                )}
                {actionButton('Contester', CircleAlert, () => toggleForm('dispute'))}
              </>
            )}
            {canResolve && payout.status === 'disputed' &&
              actionButton('Résoudre la contestation', ClipboardCheck, () => toggleForm('resolve'))}
            {canCancel && isUnpaid(payout.status) &&
              actionButton('Annuler le versement', X, () => toggleForm('cancel'), 'destructive')}
          </div>
        )}

        {openForm && (
          <form className="grid gap-3 rounded-lg border bg-muted/20 p-4" onSubmit={submitForm}>
            {openForm === 'declare' ? (
              <>
                <p className="text-sm font-medium">Enregistrer la référence d’un transfert déjà effectué</p>
                <div className="grid gap-2">
                  <Label htmlFor={`payout-reference-${payout.id}`}>Référence du transfert *</Label>
                  <Input
                    id={`payout-reference-${payout.id}`}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    maxLength={255}
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`payout-note-${payout.id}`}>Note (facultative)</Label>
                  <Textarea
                    id={`payout-note-${payout.id}`}
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    maxLength={5000}
                    rows={2}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={disabled || submitting || !reference.trim()}>
                    {submitting ? 'Enregistrement…' : 'Confirmer le transfert déclaré'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setOpenForm(null)}>
                    Fermer
                  </Button>
                </div>
              </>
            ) : null}
            {openForm === 'dispute' ? (
              <>
                <p className="text-sm font-medium">Expliquez pourquoi la réception est contestée</p>
                <div className="grid gap-2">
                  <Label htmlFor={`payout-dispute-${payout.id}`}>Motif (3 à 2 000 caractères) *</Label>
                  <Textarea
                    id={`payout-dispute-${payout.id}`}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    minLength={3}
                    maxLength={2000}
                    required
                    rows={3}
                  />
                </div>
                <FormButtons submitting={submitting} disabled={disabled || reason.trim().length < 3} onCancel={() => setOpenForm(null)} label="Envoyer la contestation" />
              </>
            ) : null}
            {openForm === 'resolve' ? (
              <>
                <p className="text-sm font-medium">La résolution confirme la réception du versement.</p>
                <div className="grid gap-2">
                  <Label htmlFor={`payout-resolution-${payout.id}`}>Justification (3 à 2 000 caractères) *</Label>
                  <Textarea
                    id={`payout-resolution-${payout.id}`}
                    value={resolutionNote}
                    onChange={(event) => setResolutionNote(event.target.value)}
                    minLength={3}
                    maxLength={2000}
                    required
                    rows={3}
                  />
                </div>
                <FormButtons submitting={submitting} disabled={disabled || resolutionNote.trim().length < 3} onCancel={() => setOpenForm(null)} label="Confirmer la résolution" />
              </>
            ) : null}
            {openForm === 'cancel' ? (
              <>
                <p className="text-sm font-medium">Un versement annulé ne peut pas être réactivé.</p>
                <div className="grid gap-2">
                  <Label htmlFor={`payout-cancel-${payout.id}`}>Motif (3 à 2 000 caractères) *</Label>
                  <Textarea
                    id={`payout-cancel-${payout.id}`}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    minLength={3}
                    maxLength={2000}
                    required
                    rows={3}
                  />
                </div>
                <FormButtons destructive submitting={submitting} disabled={disabled || reason.trim().length < 3} onCancel={() => setOpenForm(null)} label="Annuler le versement" />
              </>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function FormButtons({
  label,
  submitting,
  disabled,
  destructive = false,
  onCancel,
}: {
  label: string
  submitting: boolean
  disabled: boolean
  destructive?: boolean
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" size="sm" variant={destructive ? 'destructive' : 'default'} disabled={disabled || submitting}>
        {submitting ? 'Enregistrement…' : label}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Fermer
      </Button>
    </div>
  )
}

export default function TontinePayoutsPanel({
  tontineId,
  currency,
  canManage,
  isArchived,
}: TontinePayoutsPanelProps) {
  const { getAccessTokenSilently } = useAuth0()
  const user = useCurrentUser()
  const confirm = useConfirm()

  const [cycles, setCycles] = useState<Cycle[]>([])
  const [cycleTotal, setCycleTotal] = useState(0)
  const [cycleOffset, setCycleOffset] = useState(0)
  const [cyclesLoading, setCyclesLoading] = useState(true)
  const [cyclesError, setCyclesError] = useState('')
  const [cycleReload, setCycleReload] = useState(0)
  const [selectedCycleId, setSelectedCycleId] = useState('')

  const [membership, setMembership] = useState<TontineMembership>()
  const [memberships, setMemberships] = useState<TontineMembership[]>([])
  const [membershipLoading, setMembershipLoading] = useState(true)
  const [membershipError, setMembershipError] = useState('')

  const [payouts, setPayouts] = useState<Payout[]>([])
  const [summary, setSummary] = useState<PayoutSummary>()
  const [payoutsLoading, setPayoutsLoading] = useState(false)
  const [payoutsError, setPayoutsError] = useState('')
  const [payoutReload, setPayoutReload] = useState(0)
  const [busy, setBusy] = useState('')
  const [generating, setGenerating] = useState(false)

  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId)
  const canManagePayouts =
    canManage && (membership?.role === 'owner' || membership?.role === 'manager')
  const canDeclareManualTransfer =
    membership?.role === 'owner' || membership?.role === 'treasurer'
  const canCancelPayout = membership?.role === 'owner'

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setMembershipLoading(true)
    setMembershipError('')
    setMembership(undefined)
    setMemberships([])
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const memberships = await listTontineMemberships(token, tontineId, controller.signal)
        if (active) {
          setMemberships(memberships)
          setMembership(activeMembership(memberships, user.id))
        }
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === 'AbortError')) {
          setMembershipError(messageOf(caught, 'Impossible de vérifier votre rôle dans la tontine.'))
        }
      } finally {
        if (active) setMembershipLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, tontineId, user.id])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setCyclesLoading(true)
    setCyclesError('')
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const page = await listCycles(token, tontineId, cycleOffset, controller.signal)
        if (!active) return
        setCycles(page.items)
        setCycleTotal(page.total)
        setSelectedCycleId((current) =>
          page.items.some((cycle) => cycle.id === current) ? current : (page.items[0]?.id ?? ''),
        )
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === 'AbortError')) {
          setCyclesError(messageOf(caught, 'Impossible de charger les cycles.'))
        }
      } finally {
        if (active) setCyclesLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [cycleOffset, cycleReload, getAccessTokenSilently, tontineId])

  useEffect(() => {
    if (!selectedCycleId || membershipLoading || !membership) {
      setPayouts([])
      setSummary(undefined)
      setPayoutsLoading(false)
      return
    }
    const controller = new AbortController()
    let active = true
    setPayoutsLoading(true)
    setPayoutsError('')
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const [firstPage, cycleSummary] = await Promise.all([
          listCyclePayouts(token, tontineId, selectedCycleId, 0, controller.signal),
          getCyclePayoutSummary(token, tontineId, selectedCycleId, controller.signal),
        ])
        const allPayouts = [...firstPage.items]
        for (let offset = firstPage.limit; offset < firstPage.total; offset += firstPage.limit) {
          const page = await listCyclePayouts(
            token,
            tontineId,
            selectedCycleId,
            offset,
            controller.signal,
          )
          allPayouts.push(...page.items)
        }
        if (!active) return
        setPayouts(allPayouts)
        setSummary(cycleSummary)
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === 'AbortError')) {
          setPayoutsError(messageOf(caught, 'Impossible de charger les versements du cycle.'))
          setPayouts([])
          setSummary(undefined)
        }
      } finally {
        if (active) setPayoutsLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, membership, membershipLoading, payoutReload, selectedCycleId, tontineId])

  const reloadPayouts = useCallback(() => {
    setPayoutReload((value) => value + 1)
  }, [])

  const runPayoutAction = useCallback(async (payout: Payout, action: PayoutAction): Promise<boolean> => {
    const descriptions: Record<PayoutAction['type'], string> = {
      'refresh-readiness': 'L’éligibilité sera recalculée à partir des cotisations réellement confirmées.',
      approve: `Vous allez approuver le montant total de ${formatAmount(payout.expected_amount, payout.currency)}.`,
      'declare-paid': 'Confirmez uniquement un transfert déjà effectué. Cette déclaration ne déclenche aucun mouvement de fonds.',
      'confirm-receipt': 'Confirmez que vous avez effectivement reçu ce versement.',
      dispute: 'La contestation sera transmise aux responsables de la tontine.',
      'resolve-dispute': 'La résolution marquera le versement comme reçu.',
      cancel: 'Le versement sera annulé définitivement.',
    }
    const confirmed = await confirm({
      title: `Confirmer : ${payoutStatusLabels[payout.status]} · ${formatAmount(payout.expected_amount, payout.currency)}`,
      description: descriptions[action.type],
      confirmLabel: action.type === 'cancel' ? 'Annuler le versement' : 'Confirmer',
      destructive: action.type === 'cancel' || action.type === 'dispute',
    })
    if (!confirmed) return false

    setBusy(payout.id)
    try {
      const token = await getAccessTokenSilently()
      await transitionPayout(token, payout.id, action)
      const successMessages: Record<PayoutAction['type'], string> = {
        'refresh-readiness': 'L’éligibilité du versement a été recalculée.',
        approve: 'Le versement a été approuvé.',
        'declare-paid': 'Le transfert manuel a été déclaré.',
        'confirm-receipt': 'La réception du versement a été confirmée.',
        dispute: 'La contestation a été transmise.',
        'resolve-dispute': 'La contestation a été résolue.',
        cancel: 'Le versement a été annulé.',
      }
      toast.success(successMessages[action.type])
      reloadPayouts()
      return true
    } catch (caught) {
      toast.error(messageOf(caught, 'Action impossible.'))
      throw caught
    } finally {
      setBusy('')
    }
  }, [confirm, getAccessTokenSilently, reloadPayouts])

  const generatePayouts = async () => {
    if (!selectedCycle) return
    const confirmed = await confirm({
      title: 'Générer les versements du cycle ?',
      description: 'La génération est idempotente. Elle ne crée les versements que lorsque toutes les cotisations attendues existent.',
      confirmLabel: 'Générer les versements',
    })
    if (!confirmed) return
    setGenerating(true)
    try {
      const token = await getAccessTokenSilently()
      await generateCyclePayouts(token, tontineId, selectedCycle.id)
      toast.success('La génération des versements est terminée.')
      reloadPayouts()
    } catch (caught) {
      toast.error(messageOf(caught, 'Impossible de générer les versements.'))
    } finally {
      setGenerating(false)
    }
  }

  const retryCycles = () => setCycleReload((value) => value + 1)
  const cyclePageHasPrevious = cycleOffset > 0
  const cyclePageHasNext = cycleOffset + 20 < cycleTotal

  return (
    <section className="space-y-6" aria-label="Versements de la tontine">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote aria-hidden="true" className="h-5 w-5" />
            Versements
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Suivi des montants attendus, approbations et transferts manuels déclarés par les responsables.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {membershipLoading ? (
            <p role="status" className="text-sm text-muted-foreground">Vérification de votre rôle…</p>
          ) : membershipError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
              <CircleAlert aria-hidden="true" className="h-4 w-4" />
              <span>{membershipError}</span>
            </div>
          ) : !membership ? (
            <p className="text-sm text-muted-foreground">Aucune adhésion active ne permet d’accéder aux versements.</p>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-56 gap-2">
              <Label htmlFor="payout-cycle">Cycle</Label>
              <select
                id="payout-cycle"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedCycleId}
                onChange={(event) => setSelectedCycleId(event.target.value)}
                disabled={cyclesLoading || cycles.length === 0 || membershipLoading || !membership}
              >
                {cycles.length === 0 ? <option value="">Aucun cycle</option> : null}
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name} · cycle {cycle.sequence_number}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cyclesLoading}
              onClick={retryCycles}
            >
              <RefreshCw aria-hidden="true" />
              Actualiser les cycles
            </Button>
            {canManagePayouts && !isArchived && selectedCycle &&
              (selectedCycle.status === 'active' || selectedCycle.status === 'completed') ? (
                <Button type="button" size="sm" disabled={generating || payoutsLoading} onClick={() => void generatePayouts()}>
                  {generating ? 'Génération…' : 'Générer les versements'}
                </Button>
              ) : null}
            {cycleTotal > 20 ? (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {cycleOffset + 1}–{Math.min(cycleOffset + cycles.length, cycleTotal)} sur {cycleTotal}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Cycles précédents"
                  disabled={!cyclePageHasPrevious || cyclesLoading}
                  onClick={() => setCycleOffset((offset) => Math.max(0, offset - 20))}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Cycles suivants"
                  disabled={!cyclePageHasNext || cyclesLoading}
                  onClick={() => setCycleOffset((offset) => offset + 20)}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
          {cyclesError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
              <CircleAlert aria-hidden="true" className="h-4 w-4" />
              <span>{cyclesError}</span>
              <Button type="button" size="sm" variant="outline" onClick={retryCycles}>Réessayer</Button>
            </div>
          ) : null}
          {isArchived ? (
            <p className="text-sm text-muted-foreground">Tontine archivée : les opérations sur les versements sont désactivées.</p>
          ) : null}
        </CardContent>
      </Card>

      {cyclesLoading ? (
        <p role="status" className="text-sm text-muted-foreground">Chargement des cycles…</p>
      ) : cyclesError ? null : cycles.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Aucun cycle disponible"
          description="Les versements apparaîtront ici une fois qu’un cycle aura été créé."
        />
      ) : !membership ? null : (
        <>
          {payoutsError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
              <CircleAlert aria-hidden="true" className="h-4 w-4" />
              <span>{payoutsError}</span>
              <Button type="button" size="sm" variant="outline" onClick={reloadPayouts}>Réessayer</Button>
            </div>
          ) : null}

          {summary ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Récapitulatif · {summary.total} versement{summary.total > 1 ? 's' : ''}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryMetric label="Attendu" amount={summary.expected_amount} currency={summary.currency || currency} />
                <SummaryMetric label="Disponible" amount={summary.available_amount} currency={summary.currency || currency} />
                <SummaryMetric label="Approuvé" amount={summary.approved_amount} currency={summary.currency || currency} />
                <SummaryMetric label="Déclaré transféré" amount={summary.declared_paid_amount} currency={summary.currency || currency} />
                {(['pending', 'ready', 'approved', 'declared_paid', 'received', 'disputed', 'cancelled'] as const).map((status) => (
                  <div key={status} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-4 py-3">
                    <StatusBadge status={status} label={payoutStatusLabels[status]} />
                    <span className="text-sm font-semibold">{summary.counts[status] ?? 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {payoutsLoading ? (
            <p role="status" className="text-sm text-muted-foreground">Chargement des versements…</p>
          ) : payoutsError ? null : payouts.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="Aucun versement généré"
              description={
                selectedCycle && (selectedCycle.status === 'active' || selectedCycle.status === 'completed')
                  ? 'Les responsables peuvent générer les versements lorsque toutes les cotisations attendues existent.'
                  : 'La génération des versements est disponible lorsque le cycle est actif ou terminé.'
              }
            />
          ) : (
            <div className="space-y-4">
              {payouts.map((payout) => {
                const isBeneficiary = payout.beneficiary_membership_id === membership.id
                const canActAsBeneficiary = isBeneficiary
                return (
                  <PayoutCard
                    key={payout.id}
                    payout={payout}
                    beneficiaryLabel={isBeneficiary
                      ? 'Vous êtes bénéficiaire'
                      : membershipLabel(
                          memberships.find((item) => item.id === payout.beneficiary_membership_id),
                          payout.beneficiary_membership_id,
                        )}
                    canRefresh={Boolean(membership) && !isArchived && (payout.status === 'pending' || payout.status === 'ready')}
                    canApprove={Boolean(canManagePayouts) && !isArchived}
                    canDeclarePaid={Boolean(canDeclareManualTransfer) && !isArchived}
                    canActAsBeneficiary={canActAsBeneficiary && !isArchived}
                    canResolve={Boolean(canManagePayouts) && !isArchived}
                    canCancel={Boolean(canCancelPayout) && !isArchived}
                    disabled={isArchived || payoutsLoading || generating || Boolean(busy)}
                    onAction={(action) => runPayoutAction(payout, action)}
                  />
                )
              })}
            </div>
          )}
          {busy ? <p role="status" className="text-sm text-muted-foreground">Mise à jour du versement…</p> : null}
        </>
      )}
    </section>
  )
}
