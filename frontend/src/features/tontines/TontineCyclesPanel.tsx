import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowDown, ArrowUp, CalendarClock, CircleCheck, CircleX, Coins, Pencil, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { EmptyState } from '@/components/shared/empty-state'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { messageOf } from '@/lib/http'
import {
  activateCycle,
  cancelCycle,
  completeCycle,
  confirmContribution,
  createCycle,
  declareContribution,
  generateCycleTurns,
  generateExpectedContributions,
  listCycles,
  listMyContributions,
  listCycleContributions,
  listTontineMemberships,
  membershipLabel,
  rejectContribution,
  reorderCycleTurns,
  scheduleCycle,
  updateCycle,
  type Contribution,
  type Cycle,
  type CycleFrequency,
  type CycleUpdateInput,
  type TontineMembership,
} from '@/features/tontines/cycles-api'

export type TontineCyclesPanelProps = {
  tontineId: string
  currency: string
  canManage: boolean
  isArchived: boolean
}

const cycleStatusLabels: Record<Cycle['status'], string> = {
  draft: 'Brouillon',
  scheduled: 'Planifié',
  active: 'Actif',
  completed: 'Terminé',
  cancelled: 'Annulé',
}

const contributionStatusLabels: Record<Contribution['effective_status'], string> = {
  pending: 'En attente',
  declared: 'Déclarée',
  confirmed: 'Confirmée',
  rejected: 'Rejetée',
  cancelled: 'Annulée',
  late: 'En retard',
}

function formatDate(value: string, timezone?: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value))
}

function amountLabel(value: string, currency: string): string {
  return `${value} ${currency}`
}

function activeMembershipRole(
  memberships: TontineMembership[],
  userId: string,
): TontineMembership | undefined {
  return memberships.find((membership) => membership.user_id === userId && membership.status === 'active')
}

function isFinancialRole(role: TontineMembership['role'] | undefined): boolean {
  return role === 'owner' || role === 'manager' || role === 'treasurer'
}

export function TontineCyclesPanel({
  tontineId,
  currency,
  canManage,
  isArchived,
}: TontineCyclesPanelProps) {
  const { getAccessTokenSilently } = useAuth0()
  const user = useCurrentUser()
  const confirm = useConfirm()

  const [cycles, setCycles] = useState<Cycle[]>([])
  const [cycleTotal, setCycleTotal] = useState(0)
  const [cycleOffset, setCycleOffset] = useState(0)
  const [cyclesLoading, setCyclesLoading] = useState(true)
  const [cyclesError, setCyclesError] = useState('')
  const [cycleReload, setCycleReload] = useState(0)

  const [membership, setMembership] = useState<TontineMembership | undefined>()
  const [memberships, setMemberships] = useState<TontineMembership[]>([])
  const [membershipLoading, setMembershipLoading] = useState(true)
  const [membershipError, setMembershipError] = useState('')

  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [contributionTotal, setContributionTotal] = useState(0)
  const [contributionOffset, setContributionOffset] = useState(0)
  const [contributionsLoading, setContributionsLoading] = useState(false)
  const [contributionsError, setContributionsError] = useState('')
  const [contributionReload, setContributionReload] = useState(0)
  const [busy, setBusy] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCycleId, setEditingCycleId] = useState('')
  const [declaringId, setDeclaringId] = useState('')
  const [rejectingId, setRejectingId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [myContributionPage, setMyContributionPage] = useState(0)

  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId)
  const cycleManager = membership?.role === 'owner' || membership?.role === 'manager'
  const canManageCycles = canManage && Boolean(cycleManager) && !isArchived
  const canReviewContributions = isFinancialRole(membership?.role)
  const canDeclare = Boolean(membership) && !isArchived
  const membershipById = useMemo(
    () => new Map(memberships.map((item) => [item.id, item])),
    [memberships],
  )
  const labelFor = (membershipId: string) =>
    membershipLabel(membershipById.get(membershipId), membershipId)
  const visibleContributions = useMemo(() => {
    if (canReviewContributions) return contributions
    const matches = contributions.filter((item) => item.cycle_id === selectedCycleId)
    const start = myContributionPage * 20
    return matches.slice(start, start + 20)
  }, [canReviewContributions, contributions, myContributionPage, selectedCycleId])
  const ownContributionCount = useMemo(
    () => contributions.filter((item) => item.cycle_id === selectedCycleId).length,
    [contributions, selectedCycleId],
  )

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
        const items = await listTontineMemberships(token, tontineId, controller.signal)
        if (!active) return
        setMemberships(items)
        setMembership(activeMembershipRole(items, user.id))
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
    setContributionOffset(0)
    setMyContributionPage(0)
  }, [selectedCycleId])

  useEffect(() => {
    if (!selectedCycleId || membershipLoading || !membership) {
      setContributions([])
      setContributionTotal(0)
      return
    }
    const controller = new AbortController()
    let active = true
    setContributionsLoading(true)
    setContributionsError('')
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        if (isFinancialRole(membership.role)) {
          const page = await listCycleContributions(
            token,
            tontineId,
            selectedCycleId,
            contributionOffset,
            controller.signal,
          )
          if (active) {
            setContributions(page.items)
            setContributionTotal(page.total)
          }
        } else {
          const firstPage = await listMyContributions(token, 0, controller.signal)
          const allItems = [...firstPage.items]
          for (let offset = firstPage.limit; offset < firstPage.total; offset += firstPage.limit) {
            const page = await listMyContributions(token, offset, controller.signal)
            allItems.push(...page.items)
          }
          if (active) {
            const forCycle = allItems.filter((item) => item.cycle_id === selectedCycleId)
            setContributions(forCycle)
            setContributionTotal(forCycle.length)
          }
        }
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === 'AbortError')) {
          setContributionsError(messageOf(caught, 'Impossible de charger les cotisations.'))
        }
      } finally {
        if (active) setContributionsLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [
    contributionOffset,
    contributionReload,
    getAccessTokenSilently,
    membership,
    membershipLoading,
    selectedCycleId,
    tontineId,
  ])

  async function runAction(
    key: string,
    work: (token: string) => Promise<unknown>,
    success: string,
    refresh = 'all',
  ): Promise<boolean> {
    setBusy(key)
    try {
      const token = await getAccessTokenSilently()
      await work(token)
      toast.success(success)
      if (refresh === 'all' || refresh === 'cycles') setCycleReload((value) => value + 1)
      if (refresh === 'all' || refresh === 'contributions') setContributionReload((value) => value + 1)
      return true
    } catch (caught) {
      toast.error(messageOf(caught, 'Action impossible.'))
      return false
    } finally {
      setBusy('')
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const input = {
      name: String(data.get('name')).trim(),
      contribution_amount: String(data.get('contribution_amount')).trim(),
      frequency: String(data.get('frequency')) as CycleFrequency,
      start_date: String(data.get('start_date')),
      timezone: String(data.get('timezone')).trim(),
      beneficiary_contributes: data.get('beneficiary_contributes') === 'on',
    }
    const succeeded = await runAction(
      'create-cycle',
      (token) => createCycle(token, tontineId, input),
      'Le brouillon du cycle a été créé.',
      'cycles',
    )
    if (succeeded) {
      form.reset()
      setShowCreateForm(false)
    }
  }

  function draftChanges(cycle: Cycle, data: FormData): CycleUpdateInput {
    const next: CycleUpdateInput = {}
    const name = String(data.get('name')).trim()
    if (name !== cycle.name) next.name = name
    const amount = String(data.get('contribution_amount')).trim()
    if (Number(amount) !== Number(cycle.contribution_amount)) next.contribution_amount = amount
    const frequency = String(data.get('frequency')) as CycleFrequency
    if (frequency !== cycle.frequency) next.frequency = frequency
    const startDate = String(data.get('start_date'))
    if (startDate !== cycle.start_date) next.start_date = startDate
    const timezone = String(data.get('timezone')).trim()
    if (timezone !== cycle.timezone) next.timezone = timezone
    const beneficiaryContributes = data.get('beneficiary_contributes') === 'on'
    if (beneficiaryContributes !== cycle.beneficiary_contributes) {
      next.beneficiary_contributes = beneficiaryContributes
    }
    return next
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>, cycle: Cycle) {
    event.preventDefault()
    const changes = draftChanges(cycle, new FormData(event.currentTarget))
    if (Object.keys(changes).length === 0) {
      toast.info('Aucune modification à enregistrer.')
      return
    }
    const succeeded = await runAction(
      `update-${cycle.id}`,
      async (token) => {
        const updated = await updateCycle(token, tontineId, cycle.id, changes)
        setCycles((items) => items.map((item) => (item.id === updated.id ? updated : item)))
        return updated
      },
      'Le brouillon du cycle a été mis à jour.',
      'cycles',
    )
    if (succeeded) setEditingCycleId('')
  }

  async function confirmCycleTransition(cycle: Cycle, transition: 'activate' | 'complete' | 'cancel') {
    const details = {
      activate: {
        title: 'Activer ce cycle ?',
        description: 'L’activation crée les cotisations attendues et les enregistrements de suivi associés. Aucun paiement ni transfert réel ne sera effectué.',
        confirmLabel: 'Activer le cycle',
      },
      complete: {
        title: 'Terminer ce cycle ?',
        description: 'Le cycle passera à l’état terminé. Cette transition ne peut pas être annulée.',
        confirmLabel: 'Terminer',
      },
      cancel: {
        title: 'Annuler ce cycle ?',
        description: 'Les cotisations non confirmées de ce cycle seront annulées. Cette transition ne peut pas être annulée.',
        confirmLabel: 'Annuler le cycle',
      },
    }[transition]
    if (!(await confirm({ ...details, destructive: transition !== 'activate' }))) return
    const action = {
      activate: activateCycle,
      complete: completeCycle,
      cancel: cancelCycle,
    }[transition]
    const success = {
      activate: 'Le cycle est actif ; les cotisations attendues ont été générées.',
      complete: 'Le cycle est terminé.',
      cancel: 'Le cycle a été annulé.',
    }[transition]
    await runAction(
      `${transition}-${cycle.id}`,
      (token) => action(token, tontineId, cycle.id),
      success,
    )
  }

  async function onGenerateContributions(cycle: Cycle) {
    await runAction(
      `contributions-${cycle.id}`,
      async (token) => {
        const summary = await generateExpectedContributions(token, tontineId, cycle.id)
        toast.info(`${summary.obligations_total} cotisation(s) attendue(s) au total.`)
        return summary
      },
      'Les cotisations attendues sont à jour.',
    )
  }

  async function onMoveTurn(cycle: Cycle, position: number, direction: -1 | 1) {
    const reordered = [...cycle.turns]
    const target = position + direction
    if (target < 0 || target >= reordered.length) return
    ;[reordered[position], reordered[target]] = [reordered[target], reordered[position]]
    await runAction(
      `reorder-${cycle.id}`,
      (token) => reorderCycleTurns(
        token,
        tontineId,
        cycle.id,
        reordered.map((turn) => turn.beneficiary_membership_id),
      ),
      'L’ordre des bénéficiaires a été mis à jour.',
      'cycles',
    )
  }

  function submitDeclaration(event: FormEvent<HTMLFormElement>, contributionId: string) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void runAction(
      `declare-${contributionId}`,
      (token) => declareContribution(token, contributionId, {
        declaration_reference: String(data.get('reference')).trim() || null,
        declaration_note: String(data.get('note')).trim() || null,
      }),
      'Votre déclaration a été envoyée au trésorier ou au gestionnaire.',
      'contributions',
    )
    setDeclaringId('')
  }

  async function onConfirmContribution(item: Contribution) {
    if (!(await confirm({
      title: 'Confirmer cette déclaration ?',
      description: 'Confirmez uniquement une cotisation dont vous avez vérifié le règlement. Cette action enregistre votre validation ; elle ne déclenche pas de paiement.',
      confirmLabel: 'Confirmer la déclaration',
    }))) return
    await runAction(
      `confirm-${item.id}`,
      (token) => confirmContribution(token, item.id),
      'La cotisation a été confirmée.',
      'contributions',
    )
  }

  function submitRejection(event: FormEvent<HTMLFormElement>, contributionId: string) {
    event.preventDefault()
    const reason = rejectReason.trim()
    void runAction(
      `reject-${contributionId}`,
      (token) => rejectContribution(token, contributionId, reason),
      'La déclaration a été rejetée.',
      'contributions',
    )
    setRejectingId('')
    setRejectReason('')
  }

  const cyclePageCount = Math.max(1, Math.ceil(cycleTotal / 20))
  const cyclePage = Math.floor(cycleOffset / 20) + 1
  const contributionPageCount = Math.max(1, Math.ceil(contributionTotal / 20))
  const contributionPage = canReviewContributions
    ? Math.floor(contributionOffset / 20) + 1
    : myContributionPage + 1
  const memberContributionPageCount = Math.max(1, Math.ceil(ownContributionCount / 20))

  return (
    <section aria-labelledby="cycles-heading" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="cycles-heading" className="text-xl font-semibold">Cycles et cotisations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les tours de bénéficiaires et suivez les déclarations. Aucune opération de paiement n’est exécutée ici.
          </p>
        </div>
        {canManageCycles ? (
          <Button onClick={() => setShowCreateForm((value) => !value)} aria-expanded={showCreateForm}>
            {showCreateForm ? 'Fermer le formulaire' : 'Créer un cycle'}
          </Button>
        ) : null}
      </div>

      {isArchived ? (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Cette tontine est archivée : les cycles et cotisations sont consultables en lecture seule.
        </p>
      ) : null}

      {membershipError ? (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {membershipError} Les actions dépendant de votre rôle sont désactivées.
        </p>
      ) : null}

      {showCreateForm && canManageCycles ? (
        <Card>
          <CardHeader><CardTitle>Créer un brouillon de cycle</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={(event) => void submitCreate(event)} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cycle-name">Nom du cycle</Label>
                <Input id="cycle-name" name="name" minLength={3} maxLength={120} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cycle-amount">Cotisation par membre ({currency})</Label>
                <Input id="cycle-amount" name="contribution_amount" type="number" min="0.01" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cycle-frequency">Fréquence des tours</Label>
                <select
                  id="cycle-frequency"
                  name="frequency"
                  defaultValue="monthly"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="weekly">Hebdomadaire</option>
                  <option value="monthly">Mensuelle</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cycle-start-date">Date du premier tour</Label>
                <Input id="cycle-start-date" name="start_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cycle-timezone">Fuseau horaire (nom IANA)</Label>
                <Input id="cycle-timezone" name="timezone" required defaultValue="Europe/Paris" placeholder="Europe/Paris" />
              </div>
              <label className="flex items-start gap-3 text-sm sm:col-span-2">
                <input
                  name="beneficiary_contributes"
                  type="checkbox"
                  defaultChecked
                  className="mt-1 size-4 accent-primary"
                />
                <span>Le bénéficiaire cotise aussi pendant son propre tour.</span>
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" disabled={Boolean(busy)}>
                  {busy === 'create-cycle' ? 'Création…' : 'Créer le brouillon'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>Fermer</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {cyclesLoading ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
          Chargement des cycles…
        </div>
      ) : cyclesError ? (
        <div role="alert" className="rounded-lg border border-destructive/40 p-5">
          <p className="text-sm text-destructive">{cyclesError}</p>
          <Button className="mt-3" variant="outline" onClick={() => setCycleReload((value) => value + 1)}>
            <RefreshCw aria-hidden="true" /> Réessayer
          </Button>
        </div>
      ) : cycles.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Aucun cycle pour le moment"
          description={canManageCycles ? 'Créez un brouillon pour préparer le calendrier des bénéficiaires.' : 'Les cycles de cette tontine apparaîtront ici.'}
          action={canManageCycles ? <Button onClick={() => setShowCreateForm(true)}>Créer un cycle</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {cycles.map((cycle) => (
              <Card key={cycle.id} className={cycle.id === selectedCycleId ? 'border-primary/60' : ''}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{cycle.name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Cycle {cycle.sequence_number} · {cycle.frequency === 'weekly' ? 'Hebdomadaire' : 'Mensuel'} · {amountLabel(cycle.contribution_amount, currency)}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{cycleStatusLabels[cycle.status]}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-muted-foreground">Premier tour</dt><dd>{formatDate(cycle.start_date, cycle.timezone)}</dd></div>
                    <div><dt className="text-muted-foreground">Bénéficiaire cotise</dt><dd>{cycle.beneficiary_contributes ? 'Oui' : 'Non'}</dd></div>
                    <div><dt className="text-muted-foreground">Fuseau horaire</dt><dd>{cycle.timezone}</dd></div>
                  </dl>

                  {canManageCycles && cycle.status === 'draft' ? (
                    editingCycleId === cycle.id ? (
                      <form
                        onSubmit={(event) => void submitEdit(event, cycle)}
                        aria-label={`Modifier le brouillon ${cycle.name}`}
                        className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2"
                      >
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor={`edit-name-${cycle.id}`}>Nom du cycle</Label>
                          <Input
                            id={`edit-name-${cycle.id}`}
                            name="name"
                            minLength={3}
                            maxLength={120}
                            required
                            defaultValue={cycle.name}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-amount-${cycle.id}`}>Cotisation par membre ({currency})</Label>
                          <Input
                            id={`edit-amount-${cycle.id}`}
                            name="contribution_amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            defaultValue={cycle.contribution_amount}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-frequency-${cycle.id}`}>Fréquence des tours</Label>
                          <select
                            id={`edit-frequency-${cycle.id}`}
                            name="frequency"
                            defaultValue={cycle.frequency}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            <option value="weekly">Hebdomadaire</option>
                            <option value="monthly">Mensuelle</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-start-${cycle.id}`}>Date du premier tour</Label>
                          <Input
                            id={`edit-start-${cycle.id}`}
                            name="start_date"
                            type="date"
                            required
                            defaultValue={cycle.start_date}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-timezone-${cycle.id}`}>Fuseau horaire (nom IANA)</Label>
                          <Input
                            id={`edit-timezone-${cycle.id}`}
                            name="timezone"
                            required
                            maxLength={64}
                            defaultValue={cycle.timezone}
                            placeholder="Europe/Paris"
                          />
                        </div>
                        <label className="flex items-start gap-3 text-sm sm:col-span-2">
                          <input
                            name="beneficiary_contributes"
                            type="checkbox"
                            defaultChecked={cycle.beneficiary_contributes}
                            className="mt-1 size-4 accent-primary"
                          />
                          <span>Le bénéficiaire cotise aussi pendant son propre tour.</span>
                        </label>
                        <p className="text-xs text-muted-foreground sm:col-span-2">
                          Modifier la fréquence, la date de départ ou le fuseau horaire replanifie les tours déjà générés.
                        </p>
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          <Button type="submit" disabled={Boolean(busy)}>
                            {busy === `update-${cycle.id}` ? 'Enregistrement…' : 'Enregistrer les modifications'}
                          </Button>
                          <Button type="button" variant="outline" onClick={() => setEditingCycleId('')}>Annuler</Button>
                        </div>
                      </form>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={Boolean(busy)}
                        onClick={() => setEditingCycleId(cycle.id)}
                      >
                        <Pencil aria-hidden="true" /> Modifier le brouillon
                      </Button>
                    )
                  ) : null}

                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Ordre des bénéficiaires ({cycle.turns.length})</h3>
                      {canManageCycles && cycle.status === 'draft' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(busy)}
                          onClick={() => void runAction(
                            `generate-turns-${cycle.id}`,
                            (token) => generateCycleTurns(token, tontineId, cycle.id),
                            'Le calendrier des bénéficiaires a été généré.',
                            'cycles',
                          )}
                        >
                          Générer / actualiser les tours
                        </Button>
                      ) : null}
                    </div>
                    {cycle.turns.length ? (
                      <ol className="space-y-2">
                        {cycle.turns.map((turn, index) => (
                          <li key={turn.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                            <span>
                              <strong className="mr-2">{turn.position}.</strong>
                              <span title={turn.beneficiary_membership_id}>
                                {labelFor(turn.beneficiary_membership_id)}
                              </span>
                              <span className="ml-2 text-muted-foreground">{formatDate(turn.scheduled_for, cycle.timezone)}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Button asChild size="sm" variant="ghost" className="text-primary">
                                <Link to={`/tontines/${tontineId}/cycles/${cycle.id}/turns/${turn.id}`}>
                                  Voir le tour
                                </Link>
                              </Button>
                              {canManageCycles && cycle.status === 'draft' ? (
                                <>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Monter le tour de ${labelFor(turn.beneficiary_membership_id)}`}
                                  disabled={index === 0 || Boolean(busy)}
                                  onClick={() => void onMoveTurn(cycle, index, -1)}
                                ><ArrowUp aria-hidden="true" /></Button>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Descendre le tour de ${labelFor(turn.beneficiary_membership_id)}`}
                                  disabled={index === cycle.turns.length - 1 || Boolean(busy)}
                                  onClick={() => void onMoveTurn(cycle, index, 1)}
                                ><ArrowDown aria-hidden="true" /></Button>
                                </>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        Le calendrier n’est pas encore généré.
                      </p>
                    )}
                  </div>

                  {canManageCycles ? (
                    <div className="flex flex-wrap gap-2 border-t pt-4">
                      {cycle.status === 'draft' ? (
                        <Button
                          size="sm"
                          disabled={Boolean(busy) || cycle.turns.length === 0}
                          onClick={() => void runAction(
                            `schedule-${cycle.id}`,
                            (token) => scheduleCycle(token, tontineId, cycle.id),
                            'Le cycle est planifié.',
                          )}
                        >Planifier</Button>
                      ) : null}
                      {cycle.status === 'scheduled' ? (
                        <Button size="sm" disabled={Boolean(busy)} onClick={() => void confirmCycleTransition(cycle, 'activate')}>
                          Activer
                        </Button>
                      ) : null}
                      {cycle.status === 'active' ? (
                        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void confirmCycleTransition(cycle, 'complete')}>
                          Terminer
                        </Button>
                      ) : null}
                      {(cycle.status === 'draft' || cycle.status === 'scheduled' || cycle.status === 'active') &&
                        membership?.role === 'owner' ? (
                          <Button size="sm" variant="destructive" disabled={Boolean(busy)} onClick={() => void confirmCycleTransition(cycle, 'cancel')}>Annuler le cycle</Button>
                        ) : null}
                      {cycle.status === 'scheduled' || cycle.status === 'active' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(busy)}
                          onClick={() => void onGenerateContributions(cycle)}
                        >
                          <Coins aria-hidden="true" /> Générer les cotisations attendues
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant={cycle.id === selectedCycleId ? 'secondary' : 'outline'}
                    aria-pressed={cycle.id === selectedCycleId}
                    onClick={() => {
                      setContributionOffset(0)
                      setMyContributionPage(0)
                      setSelectedCycleId(cycle.id)
                    }}
                  >
                    {cycle.id === selectedCycleId ? 'Cotisations affichées' : 'Voir les cotisations'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {cyclePageCount > 1 ? (
            <nav aria-label="Pagination des cycles" className="flex items-center justify-between gap-3">
              <Button variant="outline" disabled={cycleOffset === 0 || Boolean(busy)} onClick={() => setCycleOffset(Math.max(0, cycleOffset - 20))}>Précédent</Button>
              <span className="text-sm text-muted-foreground">Page {cyclePage} sur {cyclePageCount}</span>
              <Button variant="outline" disabled={cycleOffset + 20 >= cycleTotal || Boolean(busy)} onClick={() => setCycleOffset(cycleOffset + 20)}>Suivant</Button>
            </nav>
          ) : null}
        </>
      )}

      {selectedCycle ? (
        <Card aria-labelledby="contributions-heading">
          <CardHeader>
            <CardTitle id="contributions-heading">Cotisations — {selectedCycle.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {canReviewContributions
                ? 'Vous pouvez consulter toutes les cotisations et traiter les déclarations.'
                : 'Vous ne voyez que vos propres cotisations.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {membershipLoading || contributionsLoading ? (
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Chargement des cotisations…</p>
            ) : contributionsError ? (
              <div role="alert" className="space-y-3">
                <p className="text-sm text-destructive">{contributionsError}</p>
                <Button variant="outline" onClick={() => setContributionReload((value) => value + 1)}>
                  <RefreshCw aria-hidden="true" /> Réessayer
                </Button>
              </div>
            ) : visibleContributions.length === 0 ? (
              <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                Aucune cotisation {canReviewContributions ? 'à afficher pour ce cycle.' : 'ne vous est attribuée pour ce cycle.'}
              </p>
            ) : (
              <div className="space-y-3">
                {visibleContributions.map((item) => {
                  const isMine = item.membership_id === membership?.id
                  const declarationFormId = `declaration-${item.id}`
                  const rejectionFormId = `rejection-${item.id}`
                  return (
                    <article key={item.id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 text-sm">
                          <p className="font-medium">
                            {amountLabel(item.amount_due, currency)} · {labelFor(item.membership_id)}
                            {isMine ? ' (vous)' : ''}
                          </p>
                          <p className="text-muted-foreground">Échéance : {formatDate(item.due_at)}</p>
                          {item.declaration_reference ? <p>Référence déclarée : {item.declaration_reference}</p> : null}
                          {item.declaration_note ? <p className="whitespace-pre-wrap">{item.declaration_note}</p> : null}
                          {item.rejection_reason ? <p className="text-destructive">Motif : {item.rejection_reason}</p> : null}
                        </div>
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                          {contributionStatusLabels[item.effective_status]}
                        </span>
                      </div>

                      {canDeclare && isMine && ['pending', 'rejected'].includes(item.status) ? (
                        declaringId === item.id ? (
                          <form id={declarationFormId} onSubmit={(event) => submitDeclaration(event, item.id)} className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`${declarationFormId}-reference`}>Référence (facultatif)</Label>
                              <Input id={`${declarationFormId}-reference`} name="reference" maxLength={255} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`${declarationFormId}-note`}>Note (facultatif)</Label>
                              <Textarea id={`${declarationFormId}-note`} name="note" maxLength={5000} />
                            </div>
                            <p className="text-xs text-muted-foreground sm:col-span-2">
                              Cette action enregistre une déclaration uniquement ; elle n’effectue aucun paiement.
                            </p>
                            <div className="flex gap-2 sm:col-span-2">
                              <Button type="submit" disabled={Boolean(busy)}>Envoyer la déclaration</Button>
                              <Button type="button" variant="outline" onClick={() => setDeclaringId('')}>Fermer</Button>
                            </div>
                          </form>
                        ) : (
                          <Button className="mt-3" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => setDeclaringId(item.id)}>
                            Déclarer ma cotisation
                          </Button>
                        )
                      ) : null}

                      {canReviewContributions && !isArchived && item.status === 'declared' ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" disabled={Boolean(busy)} onClick={() => void onConfirmContribution(item)}>
                            <CircleCheck aria-hidden="true" /> Confirmer
                          </Button>
                          {rejectingId === item.id ? (
                            <form id={rejectionFormId} onSubmit={(event) => submitRejection(event, item.id)} className="w-full space-y-2">
                              <Label htmlFor={`${rejectionFormId}-reason`}>Motif du rejet (obligatoire)</Label>
                              <Textarea
                                id={`${rejectionFormId}-reason`}
                                value={rejectReason}
                                onChange={(event) => setRejectReason(event.target.value)}
                                minLength={3}
                                maxLength={2000}
                                required
                              />
                              <div className="flex gap-2">
                                <Button type="submit" size="sm" variant="destructive" disabled={Boolean(busy) || rejectReason.trim().length < 3}>
                                  <CircleX aria-hidden="true" /> Rejeter la déclaration
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => { setRejectingId(''); setRejectReason('') }}>Fermer</Button>
                              </div>
                            </form>
                          ) : (
                            <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => { setRejectingId(item.id); setRejectReason('') }}>
                              Rejeter
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
            {!contributionsLoading && !contributionsError && contributionTotal > 20 ? (
              <nav aria-label="Pagination des cotisations" className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  disabled={canReviewContributions ? contributionOffset === 0 : myContributionPage === 0}
                  onClick={() => canReviewContributions
                    ? setContributionOffset(Math.max(0, contributionOffset - 20))
                    : setMyContributionPage((page) => Math.max(0, page - 1))}
                >Précédent</Button>
                <span className="text-sm text-muted-foreground">
                  Page {contributionPage} sur {canReviewContributions ? contributionPageCount : memberContributionPageCount}
                </span>
                <Button
                  variant="outline"
                  disabled={canReviewContributions
                    ? contributionOffset + 20 >= contributionTotal
                    : (myContributionPage + 1) * 20 >= ownContributionCount}
                  onClick={() => canReviewContributions
                    ? setContributionOffset(contributionOffset + 20)
                    : setMyContributionPage((page) => page + 1)}
                >Suivant</Button>
              </nav>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {membershipLoading ? <p className="sr-only" role="status">Vérification des autorisations…</p> : null}
    </section>
  )
}

export default TontineCyclesPanel
