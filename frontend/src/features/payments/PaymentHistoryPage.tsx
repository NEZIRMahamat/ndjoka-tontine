import { useAuth0 } from '@auth0/auth0-react'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  getMyContributions,
  getMyPayouts,
  type Contribution,
  type Payout,
} from '@/features/payments/payments-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'

type Entry =
  | { type: 'contribution'; item: Contribution; date: string }
  | { type: 'payout'; item: Payout; date: string }

export default function PaymentHistoryPage() {
  const { getAccessTokenSilently } = useAuth0()
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [totals, setTotals] = useState({ contributions: 0, payouts: 0 })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'contribution' | 'payout'>('all')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const [contributionPage, payoutPage] = await Promise.all([
          getMyContributions(token, controller.signal, 0, 'desc'),
          getMyPayouts(token, controller.signal, 0, 'desc'),
        ])
        if (!active) return
        setContributions(contributionPage.items)
        setPayouts(payoutPage.items)
        setTotals({ contributions: contributionPage.total, payouts: payoutPage.total })
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Historique indisponible'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false; controller.abort() }
  }, [getAccessTokenSilently, reload])

  async function loadMore() {
    setLoadingMore(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      const [nextContributions, nextPayouts] = await Promise.all([
        contributions.length < totals.contributions ? getMyContributions(token, undefined, contributions.length, 'desc') : null,
        payouts.length < totals.payouts ? getMyPayouts(token, undefined, payouts.length, 'desc') : null,
      ])
      if (nextContributions) setContributions((current) => [...current, ...nextContributions.items])
      if (nextPayouts) setPayouts((current) => [...current, ...nextPayouts.items])
      setTotals({
        contributions: nextContributions?.total ?? totals.contributions,
        payouts: nextPayouts?.total ?? totals.payouts,
      })
    } catch (caught) {
      setError(messageOf(caught, 'Impossible de charger la suite de l’historique'))
    } finally {
      setLoadingMore(false)
    }
  }

  const entries = useMemo(() => {
    const rows: Entry[] = [
      ...contributions.map((item): Entry => ({ type: 'contribution', item, date: item.due_at })),
      ...payouts.map((item): Entry => ({ type: 'payout', item, date: item.scheduled_for })),
    ]
    const term = search.trim().toLocaleLowerCase('fr-FR')
    return rows
      .filter((row) => (filter === 'all' || row.type === filter) &&
        (!term || (row.type === 'contribution'
          ? `${row.item.tontine_name ?? ''} ${row.item.cycle_name ?? ''} ${row.item.id}`
          : `${row.item.tontine_id} ${row.item.id}`)
          .toLocaleLowerCase('fr-FR').includes(term)))
      .sort((left, right) => right.date.localeCompare(left.date))
  }, [contributions, payouts, filter, search])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/paiements" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Paiements</Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Historique des opérations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cotisations et versements de vos tontines, classés par échéance prévue.</p>
      </header>
      <Card>
        <CardContent className="space-y-4 p-5">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Rechercher une opération</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un groupe, un cycle ou un identifiant…" className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </label>
          <div className="flex flex-wrap gap-2" aria-label="Filtrer les opérations">
            {([
              ['all', 'Toutes'],
              ['contribution', 'Cotisations'],
              ['payout', 'Versements'],
            ] as const).map(([value, label]) =>
              <Button key={value} size="sm" variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>{label}</Button>)}
          </div>
        </CardContent>
      </Card>
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}<Button className="ml-3" variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>Réessayer</Button></div>}
      {loading ? <Skeleton className="h-64 w-full" />
        : <Card><CardContent className="divide-y p-0">
          {entries.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Aucune opération ne correspond aux filtres parmi les résultats chargés.</p>}
          {entries.map((row) => (
            <Link key={`${row.type}-${row.item.id}`} to={`/paiements/historique/${row.type}/${row.item.id}`} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${row.type === 'payout' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                {row.type === 'payout' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{row.type === 'payout' ? 'Versement bénéficiaire' : row.item.tontine_name ?? 'Cotisation'}</span>
                <span className="text-xs text-muted-foreground">{new Date(row.date).toLocaleDateString('fr-FR')} · {row.type === 'payout' ? 'Échéance du tour' : row.item.cycle_name ?? 'Cycle'}</span>
              </span>
              <span className="text-right"><span className="block text-sm font-semibold tabular-nums">{row.type === 'payout' ? formatCurrencyAmount(row.item.approved_amount ?? row.item.expected_amount, row.item.currency) : formatCurrencyAmount(row.item.amount_due, row.item.currency)}</span>
                <StatusBadge status={row.type === 'payout' ? row.item.status : row.item.effective_status} /></span>
            </Link>
          ))}
        </CardContent></Card>}
      {!loading && (contributions.length < totals.contributions || payouts.length < totals.payouts) &&
        <div className="text-center"><Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Chargement…' : `Afficher la suite (${contributions.length + payouts.length}/${totals.contributions + totals.payouts})`}</Button></div>}
    </div>
  )
}
