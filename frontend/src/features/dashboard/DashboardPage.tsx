import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  Compass,
  Plus,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BAND_LABELS, getReliability } from '@/features/profile/saver-profile-api'
import { getMonthlyContributions, getMyContributions, getMyPayouts, type Contribution, type MonthlyContribution, type Payout } from '@/features/payments/payments-api'
import { listTontines, type TontinePage } from '@/features/tontines/tontines-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'

type DashboardData = {
  tontines: TontinePage
  contributions: { items: Contribution[]; total: number }
  payouts: { items: Payout[]; total: number }
  reliability: Awaited<ReturnType<typeof getReliability>>
  monthly: MonthlyContribution[]
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

export default function DashboardPage() {
  const profile = useCurrentUser()
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [chartCurrency, setChartCurrency] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const [tontines, contributions, payouts, reliability, monthly] = await Promise.all([
          listTontines(token, 0, controller.signal),
          getMyContributions(token, controller.signal),
          getMyPayouts(token, controller.signal),
          getReliability(token, controller.signal),
          getMonthlyContributions(token, controller.signal),
        ])
        if (!active) return
        setData({
          tontines,
          contributions,
          payouts,
          reliability,
          monthly,
        })
      } catch (caught) {
        if (active) setError(messageOf(caught, 'Impossible de charger votre tableau de bord.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload])

  const activeTontines = data?.tontines.items.filter((item) => item.status === 'active') ?? []
  const contributionFollowUp =
    data?.contributions.items.filter((item) => ['pending', 'late', 'rejected'].includes(item.effective_status)).length ?? 0
  const nextPayout = useMemo(
    () =>
      data?.payouts.items
        .filter((item) => item.status !== 'received' && item.status !== 'cancelled')
        .sort((left, right) => left.scheduled_for.localeCompare(right.scheduled_for))[0],
    [data?.payouts],
  )
  const firstName = profile.display_name?.trim().split(/\s+/)[0] ?? profile.email?.split('@')[0] ?? 'membre'
  const reliabilityPercent = Math.round(Number(data?.reliability.score ?? 0) * 100)
  const onTimeRate = Math.round(Number(data?.reliability.on_time_rate ?? 0) * 100)

  if (error && !data) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-6 text-sm text-destructive">
        <p>{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => setReload((value) => value + 1)}>Réessayer</Button>
      </div>
    )
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Votre espace</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Bonjour, {firstName}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Retrouvez vos groupes d’épargne et les prochaines actions à suivre.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/explorer')}>
            <Compass /> Explorer
          </Button>
          <Button onClick={() => navigate('/tontines/create')}>
            <Plus /> Créer une tontine
          </Button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setReload((value) => value + 1)}>Réessayer</Button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Résumé de votre activité">
        <MetricCard
          icon={UsersRound}
          label="Mes tontines"
          value={data ? String(data.tontines.total) : null}
          note={`${activeTontines.length} groupe${activeTontines.length === 1 ? '' : 's'} actif${activeTontines.length === 1 ? '' : 's'} parmi les résultats`}
          tone="green"
        />
        <MetricCard
          icon={WalletCards}
          label="Cotisations à suivre"
          value={data ? String(contributionFollowUp) : null}
          note={data && data.contributions.total > data.contributions.items.length
            ? `Sur ${data.contributions.items.length} cotisations chargées`
            : contributionFollowUp ? 'À déclarer, corriger ou en retard' : 'Aucune action en attente'}
          tone={contributionFollowUp ? 'amber' : 'blue'}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Score de fiabilité"
          value={data ? `${reliabilityPercent}/100` : null}
          note={data?.reliability.is_provisional ? 'Score provisoire' : (data ? BAND_LABELS[data.reliability.band] : 'En cours de calcul')}
          tone="violet"
        />
      </section>

      <MonthlyActivity monthly={data?.monthly ?? null} currency={chartCurrency} onCurrencyChange={setChartCurrency} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
            <div>
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">Régularité</p>
              <CardTitle className="mt-1 text-lg">Votre parcours d’épargne</CardTitle>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CircleCheck className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent className="space-y-6 p-5 sm:p-6">
            {data ? (
              <>
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--primary) ${onTimeRate}%, var(--muted) ${onTimeRate}% 100%)` }}>
                    <div className="grid h-[5.25rem] w-[5.25rem] place-content-center rounded-full bg-card text-center">
                      <span className="text-2xl font-semibold tracking-tight">{onTimeRate}%</span>
                      <span className="text-[10px] text-muted-foreground">à l’heure</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {data.reliability.contributions_on_time} cotisation{data.reliability.contributions_on_time === 1 ? '' : 's'} réglée{data.reliability.contributions_on_time === 1 ? '' : 's'} à temps
                    </p>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{data.reliability.explanation}</p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${reliabilityPercent}%` }} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-border/70 pt-5 sm:grid-cols-4">
                  <CountDetail label="Suivies" value={data.reliability.contributions_total} />
                  <CountDetail label="À l’heure" value={data.reliability.contributions_on_time} />
                  <CountDetail label="En retard" value={data.reliability.contributions_late} />
                  <CountDetail label="En attente" value={data.reliability.contributions_outstanding} />
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/profile')}>
                  Voir mon profil d’épargne <ArrowRight />
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <Skeleton className="h-28 w-28 rounded-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/15 bg-[linear-gradient(145deg,white,var(--color-secondary))]">
          <CardHeader className="px-5 pt-5 sm:px-6">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">À venir</p>
            <CardTitle className="mt-1 text-lg">Prochain versement</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
            {data ? (
              nextPayout ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/80 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <CalendarClock className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{formatCurrencyAmount(nextPayout.expected_amount, nextPayout.currency)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Prévu le {dateFormat.format(new Date(nextPayout.scheduled_for))}
                      </p>
                      <div className="mt-2">
                        <StatusBadge status={nextPayout.status} />
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => navigate('/paiements')}>
                    Suivre mes paiements <ArrowRight />
                  </Button>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Les dates et montants sont ceux enregistrés dans les cycles de vos tontines.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                  <CalendarClock className="mx-auto h-7 w-7 text-muted-foreground/70" />
                  <p className="mt-3 text-sm font-medium">Aucun versement planifié</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Les versements apparaîtront ici lorsqu’un cycle vous désignera bénéficiaire.
                  </p>
                </div>
              )
            ) : (
              <Skeleton className="h-36 w-full" />
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 px-5 py-5 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Vos groupes</p>
            <CardTitle className="mt-1 text-lg">Tontines récentes</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/tontines')}>
            Tout afficher <ArrowRight />
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
          {!data ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : data.tontines.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center">
              <UsersRound className="mx-auto h-8 w-8 text-muted-foreground/70" />
              <p className="mt-3 font-medium">Vous n’avez pas encore de tontine</p>
              <p className="mt-1 text-sm text-muted-foreground">Créez votre groupe ou trouvez une tontine ouverte.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => navigate('/tontines/create')}><Plus /> Créer</Button>
                <Button size="sm" variant="outline" onClick={() => navigate('/explorer')}><Compass /> Explorer</Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.tontines.items.slice(0, 5).map((tontine) => (
                <button
                  key={tontine.id}
                  type="button"
                  onClick={() => navigate(`/tontines/${tontine.id}`)}
                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                    {tontine.name.slice(0, 2).toLocaleUpperCase('fr-FR')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{tontine.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {tontine.currency} · {tontine.max_members ? `${tontine.max_members} places max.` : 'Capacité libre'} · {tontine.is_discoverable ? 'Ouverte' : 'Sur invitation'}
                    </span>
                  </span>
                  <StatusBadge status={tontine.status} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {data?.contributions.total ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <QuickLink icon={ArrowUpRight} title="Cotisations" description={`${data.contributions.total} échéance(s) enregistrée(s)`} onClick={() => navigate('/paiements')} />
          <QuickLink icon={ArrowDownLeft} title="Versements reçus" description={`${data.payouts.items.filter((item) => item.status === 'received').length} versement(s) confirmé(s) parmi ${data.payouts.total}`} onClick={() => navigate('/paiements')} />
        </section>
      ) : null}
    </div>
  )
}

function MonthlyActivity({
  monthly,
  currency,
  onCurrencyChange,
}: {
  monthly: MonthlyContribution[] | null
  currency: string
  onCurrencyChange: (value: string) => void
}) {
  const currencies = [...new Set(monthly?.map((item) => item.currency) ?? [])]
  const selectedCurrency = currencies.includes(currency) ? currency : currencies[0]
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1))
    const key = date.toISOString().slice(0, 7)
    return {
      key,
      label: new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date),
      amount: Number(monthly?.find((item) => item.month.startsWith(key) && item.currency === selectedCurrency)?.confirmed_amount ?? 0),
    }
  })
  const maxAmount = Math.max(...months.map((item) => item.amount), 1)

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 px-5 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Activité réelle</p>
          <CardTitle className="mt-1 text-lg">Cotisations confirmées</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Montants déclarés puis confirmés par vos responsables, sans transfert intégré.</p>
        </div>
        {currencies.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Devise
            <select value={selectedCurrency} onChange={(event) => onCurrencyChange(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground">
              {currencies.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        )}
      </CardHeader>
      <CardContent className="px-5 sm:px-6">
        {!monthly ? <Skeleton className="h-40 w-full" />
          : currencies.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Aucune cotisation confirmée ces six derniers mois.</p>
            : (
              <div className="grid h-44 grid-cols-6 gap-3" aria-label={`Cotisations confirmées en ${selectedCurrency} au cours des six derniers mois`}>
                {months.map((item) => (
                  <div key={item.key} className="flex min-w-0 flex-col items-center justify-end gap-2">
                    <span className="text-center text-[10px] font-medium tabular-nums text-muted-foreground" title={formatCurrencyAmount(item.amount, selectedCurrency)}>
                      {formatCurrencyAmount(item.amount, selectedCurrency)}
                    </span>
                    <div className="flex h-24 w-full max-w-20 items-end rounded-lg bg-muted/50">
                      <div className="w-full rounded-lg bg-emerald-500 transition-[height]" style={{ height: item.amount ? `${Math.max(5, (item.amount / maxAmount) * 100)}%` : '0%' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
      </CardContent>
    </Card>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof UsersRound
  label: string
  value: string | null
  note: string
  tone: 'green' | 'amber' | 'blue' | 'violet'
}) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
  }

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {value === null ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{note}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  )
}

function CountDetail({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function QuickLink({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof ArrowUpRight
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/30 hover:bg-primary/5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  )
}
