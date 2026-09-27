import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  History,
  Clock3,
  Search,
  RotateCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useConfirm } from '@/components/shared/confirm-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  confirmPayoutReceipt,
  disputePayout,
  getMyContributions,
  getMyPayouts,
  type ActivityPage,
  type Contribution,
  type Payout,
} from '@/features/payments/payments-api'
import { listTontines, type Tontine } from '@/features/tontines/tontines-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'

type PaymentData = {
  contributions: ActivityPage<Contribution>
  payouts: ActivityPage<Payout>
  tontines: Map<string, Tontine>
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
const noContributions: Contribution[] = []
const noPayouts: Payout[] = []

function amountLabel(amount: string, currency: string | null) {
  return formatCurrencyAmount(amount, currency)
}

async function loadTontineNames(accessToken: string, signal: AbortSignal) {
  const tontines: Tontine[] = []
  let offset = 0
  let total = 0
  do {
    const page = await listTontines(accessToken, offset, signal)
    tontines.push(...page.items)
    total = page.total
    offset += page.limit
  } while (offset < total && !signal.aborted)
  return new Map(tontines.map((tontine) => [tontine.id, tontine]))
}

export default function PaymentsPage() {
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const confirm = useConfirm()
  const [data, setData] = useState<PaymentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busyId, setBusyId] = useState('')
  const [rejectId, setRejectId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [loadingMore, setLoadingMore] = useState<'contributions' | 'payouts' | null>(null)
  const [activeTab, setActiveTab] = useState<'contributions' | 'payouts'>('contributions')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  function refresh() {
    setLoading(true)
    setError('')
    setData(null)
    setReload((value) => value + 1)
  }

  async function loadMore(kind: 'contributions' | 'payouts') {
    if (!data || loadingMore) return
    setLoadingMore(kind)
    try {
      const token = await getAccessTokenSilently()
      if (kind === 'contributions') {
        const page = await getMyContributions(token, undefined, data.contributions.items.length)
        setData((current) => current && ({
          ...current,
          contributions: {
            ...page,
            items: [...current.contributions.items, ...page.items],
          },
        }))
      } else {
        const page = await getMyPayouts(token, undefined, data.payouts.items.length)
        setData((current) => current && ({
          ...current,
          payouts: {
            ...page,
            items: [...current.payouts.items, ...page.items],
          },
        }))
      }
    } catch (caught) {
      toast.error(messageOf(caught, 'Impossible de charger les échéances suivantes.'))
    } finally {
      setLoadingMore(null)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const [contributions, payouts, tontines] = await Promise.all([
          getMyContributions(token, controller.signal),
          getMyPayouts(token, controller.signal),
          loadTontineNames(token, controller.signal),
        ])
        if (!active) return
        setData({ contributions, payouts, tontines })
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === 'AbortError')) {
          setError(messageOf(caught, 'Impossible de charger votre suivi financier.'))
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload])

  const contributions = data?.contributions.items ?? noContributions
  const payouts = data?.payouts.items ?? noPayouts
  const contributionActions = contributions.filter((item) =>
    ['pending', 'late', 'rejected'].includes(item.effective_status),
  ).length
  const underReview = contributions.filter((item) => item.effective_status === 'declared').length
  const confirmed = contributions.filter((item) => item.effective_status === 'confirmed').length
  const sortedContributions = useMemo(
    () => contributions
      .filter((item) =>
        (statusFilter === 'all' || item.effective_status === statusFilter)
        && (!search.trim() || `${item.tontine_name ?? ''} ${item.cycle_name ?? ''}`.toLocaleLowerCase('fr-FR').includes(search.trim().toLocaleLowerCase('fr-FR'))),
      )
      .sort((left, right) => left.due_at.localeCompare(right.due_at)),
    [contributions, search, statusFilter],
  )
  const sortedPayouts = useMemo(
    () => payouts
      .filter((item) =>
        (statusFilter === 'all' || item.status === statusFilter)
        && (!search.trim() || (data?.tontines.get(item.tontine_id)?.name ?? '').toLocaleLowerCase('fr-FR').includes(search.trim().toLocaleLowerCase('fr-FR'))),
      )
      .sort((left, right) => right.scheduled_for.localeCompare(left.scheduled_for)),
    [payouts, data?.tontines, search, statusFilter],
  )

  async function onConfirmReceipt(payout: Payout) {
    const confirmedReceipt = await confirm({
      title: 'Confirmer la réception ?',
      description: 'Confirmez uniquement si vous avez bien reçu le versement indiqué. Cette action sera enregistrée dans l’historique de la tontine.',
      confirmLabel: 'Confirmer la réception',
    })
    if (!confirmedReceipt) return
    setBusyId(payout.id)
    try {
      const token = await getAccessTokenSilently()
      await confirmPayoutReceipt(token, payout.id)
      toast.success('La réception du versement a été confirmée.')
      refresh()
    } catch (caught) {
      toast.error(messageOf(caught, 'Impossible de confirmer ce versement.'))
    } finally {
      setBusyId('')
    }
  }

  function submitDispute(event: FormEvent<HTMLFormElement>, payoutId: string) {
    event.preventDefault()
    const reason = rejectReason.trim()
    if (reason.length < 3) {
      toast.error('Décrivez le problème en quelques mots.')
      return
    }
    setBusyId(payoutId)
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        await disputePayout(token, payoutId, reason)
        toast.success('Votre signalement a été transmis aux responsables de la tontine.')
        setRejectId('')
        setRejectReason('')
        refresh()
      } catch (caught) {
        toast.error(messageOf(caught, 'Impossible de signaler ce versement.'))
      } finally {
        setBusyId('')
      }
    })()
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Suivi financier</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Cotisations et versements</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Consultez les échéances déclarées dans vos tontines et confirmez les versements reçus.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RotateCw className={loading ? 'animate-spin' : ''} /> Actualiser
        </Button>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p>{error}</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={refresh}>
            Réessayer
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Résumé des paiements">
        <Metric icon={Clock3} title="À régulariser" value={data ? contributionActions : null} note="Parmi les cotisations affichées" tone="amber" />
        <Metric icon={CalendarClock} title="En vérification" value={data ? underReview : null} note="Parmi les cotisations affichées" tone="blue" />
        <Metric icon={CircleCheck} title="Confirmées" value={data ? confirmed : null} note="Parmi les cotisations affichées" tone="green" />
      </section>

      <Card className="border-emerald-100 bg-gradient-to-br from-emerald-900 to-teal-800 text-white">
        <CardContent className="flex flex-wrap items-center justify-between gap-5 px-6 py-6 sm:px-8">
          <div>
            <p className="text-xs font-semibold tracking-widest text-emerald-100 uppercase">Votre activité</p>
            <h3 className="mt-2 text-xl font-semibold">Retrouvez vos opérations</h3>
            <p className="mt-2 max-w-lg text-sm text-emerald-50/80">Consultez les cotisations et les versements associés à vos tontines, avec leur statut à jour.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/paiements/historique')}>
            <History /> Voir l’historique
          </Button>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value === 'payouts' ? 'payouts' : 'contributions'); setStatusFilter('all') }}>
        <TabsList>
          <TabsTrigger value="contributions">Mes cotisations ({data?.contributions.total ?? '…'})</TabsTrigger>
          <TabsTrigger value="payouts">Mes versements ({data?.payouts.total ?? '…'})</TabsTrigger>
        </TabsList>
        <div className="mt-5 flex flex-wrap gap-3 rounded-xl border bg-card p-3">
          <label className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Rechercher une tontine ou un cycle</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une tontine ou un cycle" className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Statut
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground">
              <option value="all">Tous</option>
              {activeTab === 'contributions' ? (
                <>
                  <option value="pending">En attente</option>
                  <option value="declared">Déclaré</option>
                  <option value="confirmed">Confirmé</option>
                  <option value="late">En retard</option>
                  <option value="rejected">Rejeté</option>
                </>
              ) : (
                <>
                  <option value="pending">En attente</option>
                  <option value="ready">Prêt</option>
                  <option value="approved">Approuvé</option>
                  <option value="declared_paid">Paiement déclaré</option>
                  <option value="received">Reçu</option>
                  <option value="disputed">Contesté</option>
                </>
              )}
              <option value="cancelled">Annulé</option>
            </select>
          </label>
        </div>

        <TabsContent value="contributions" className="mt-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
              <div>
                <p className="text-xs font-semibold tracking-wide text-primary uppercase">Échéances</p>
                <CardTitle className="mt-1 text-lg">Cotisations de mes tontines</CardTitle>
              </div>
              <span className="hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : contributions.length === 0 ? (
                <EmptyActivity
                  icon={CalendarClock}
                  title="Aucune cotisation enregistrée"
                  description="Les échéances apparaîtront ici lorsque les responsables activeront un cycle."
                  action={() => navigate('/tontines')}
                />
              ) : sortedContributions.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">Aucune cotisation ne correspond aux filtres parmi les résultats chargés.</p>
                  {data && data.contributions.total > contributions.length && <Button variant="outline" className="mt-3" disabled={loadingMore !== null} onClick={() => void loadMore('contributions')}>Charger d'autres cotisations</Button>}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {sortedContributions.map((item) => (
                    <div key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.effective_status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                        <ArrowUpRight className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {item.tontine_name ?? 'Tontine'}{item.cycle_name ? ` · ${item.cycle_name}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.cycle_sequence ? `Cycle ${item.cycle_sequence} · ` : ''}Échéance le {dateFormat.format(new Date(item.due_at))}
                        </p>
                        {item.rejection_reason ? <p className="mt-1 text-xs text-destructive">{item.rejection_reason}</p> : null}
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <span className="text-sm font-semibold tabular-nums">{amountLabel(item.amount_due, item.currency)}</span>
                        <StatusBadge status={item.effective_status} />
                      </div>
                      {item.tontine_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="sm:ml-2"
                          onClick={() => navigate(`/tontines/${item.tontine_id}?tab=cycles`)}
                        >
                          Détails <ArrowRight />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {data && data.contributions.total > contributions.length ? (
                    <div className="pt-4 text-center">
                      <Button variant="outline" disabled={loadingMore !== null} onClick={() => void loadMore('contributions')}>
                        {loadingMore === 'contributions' ? 'Chargement…' : `Afficher la suite (${contributions.length}/${data.contributions.total})`}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts" className="mt-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
              <div>
                <p className="text-xs font-semibold tracking-wide text-primary uppercase">Tours bénéficiaires</p>
                <CardTitle className="mt-1 text-lg">Mes versements</CardTitle>
              </div>
              <span className="hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
                <ArrowDownLeft className="h-5 w-5" />
              </span>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : payouts.length === 0 ? (
                <EmptyActivity
                  icon={CircleCheck}
                  title="Aucun versement planifié"
                  description="Les versements dont vous êtes bénéficiaire apparaîtront ici."
                  action={() => navigate('/tontines')}
                />
              ) : sortedPayouts.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">Aucun versement ne correspond aux filtres parmi les résultats chargés.</p>
                  {data && data.payouts.total > payouts.length && <Button variant="outline" className="mt-3" disabled={loadingMore !== null} onClick={() => void loadMore('payouts')}>Charger d'autres versements</Button>}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {sortedPayouts.map((payout) => {
                    const tontine = data?.tontines.get(payout.tontine_id)
                    const amount = payout.approved_amount ?? payout.expected_amount
                    return (
                      <div key={payout.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${payout.status === 'received' ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                          <ArrowDownLeft className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{tontine?.name ?? 'Tontine'}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Versement planifié le {dateFormat.format(new Date(payout.scheduled_for))}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <span className="text-sm font-semibold tabular-nums">{amountLabel(amount, payout.currency)}</span>
                          <StatusBadge status={payout.status} />
                        </div>
                        {payout.status === 'declared_paid' ? (
                          <div className="flex flex-wrap gap-2 sm:ml-2">
                            <Button size="sm" disabled={busyId === payout.id} onClick={() => void onConfirmReceipt(payout)}>
                              Confirmer la réception
                            </Button>
                            <Button size="sm" variant="outline" disabled={busyId === payout.id} onClick={() => { setRejectId(rejectId === payout.id ? '' : payout.id); setRejectReason('') }}>
                              Signaler un problème
                            </Button>
                          </div>
                        ) : null}
                        {rejectId === payout.id ? (
                          <form onSubmit={(event) => submitDispute(event, payout.id)} className="w-full space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                            <label htmlFor={`dispute-${payout.id}`} className="text-xs font-medium">Décrivez le problème</label>
                            <textarea
                              id={`dispute-${payout.id}`}
                              value={rejectReason}
                              onChange={(event) => setRejectReason(event.target.value)}
                              minLength={3}
                              maxLength={2000}
                              required
                              rows={3}
                              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            />
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="ghost" size="sm" onClick={() => setRejectId('')}>Annuler</Button>
                              <Button type="submit" size="sm" disabled={busyId === payout.id}>Envoyer le signalement</Button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    )
                  })}
                  {data && data.payouts.total > payouts.length ? (
                    <div className="pt-4 text-center">
                      <Button variant="outline" disabled={loadingMore !== null} onClick={() => void loadMore('payouts')}>
                        {loadingMore === 'payouts' ? 'Chargement…' : `Afficher la suite (${payouts.length}/${data.payouts.total})`}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Metric({
  icon: Icon,
  title,
  value,
  note,
  tone,
}: {
  icon: typeof Clock3
  title: string
  value: number | null
  note: string
  tone: 'amber' | 'blue' | 'green'
}) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
  }

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {value === null ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>}
          <p className="mt-2 text-xs text-muted-foreground">{note}</p>
        </div>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
      </CardContent>
    </Card>
  )
}

function EmptyActivity({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof CalendarClock
  title: string
  description: string
  action: () => void
}) {
  return (
    <div className="rounded-xl border border-dashed border-border py-10 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/70" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      <Button variant="outline" className="mt-4" onClick={action}>Voir mes tontines <ArrowRight /></Button>
    </div>
  )
}
