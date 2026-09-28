import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Filter, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { BackLink, ErrorNotice, SkeletonBlock } from '@/components/shared/page-primitives'
import { getMyContributions, getMyPayouts, type Contribution, type Payout } from '@/features/payments/payments-api'
import { contributionToTransaction, payoutToTransaction, sortByDateDesc, type Transaction } from '@/features/payments/payments-presentation'
import { loadAllMyTontines } from '@/features/tontines/tontine-data'
import { formatShortDate } from '@/features/tontines/tontine-presentation'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

type TypeFilter = 'all' | 'in' | 'out'

async function collect<T>(load: (offset: number) => Promise<{ items: T[]; total: number; limit: number }>): Promise<T[]> {
  const first = await load(0)
  const items = [...first.items]
  for (let offset = first.limit; offset < first.total && first.limit > 0; offset += first.limit) items.push(...(await load(offset)).items)
  return items
}

export default function TransactionHistoryPage() {
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [monthFilter, setMonthFilter] = useState('all')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const [contributions, payouts, tontines] = await Promise.all([
          collect<Contribution>((offset) => getMyContributions(token, controller.signal, offset, 'desc')),
          collect<Payout>((offset) => getMyPayouts(token, controller.signal, offset, 'desc')),
          loadAllMyTontines(token, controller.signal),
        ])
        const names = new Map(tontines.map((item) => [item.id, item.name]))
        if (active) setTransactions(sortByDateDesc([...contributions.map(contributionToTransaction), ...payouts.map((item) => payoutToTransaction(item, names.get(item.tontine_id) ?? null))]))
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Historique indisponible.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload])

  const months = useMemo(() => {
    const seen = new Map<string, string>()
    for (const tx of transactions ?? []) seen.set(tx.monthKey, tx.monthLabel)
    return [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8)
  }, [transactions])

  const filtered = useMemo(() => (transactions ?? []).filter((tx) => {
    const matchType = typeFilter === 'all' || tx.type === typeFilter
    const matchMonth = monthFilter === 'all' || tx.monthKey === monthFilter
    const matchSearch = tx.label.toLowerCase().includes(search.toLowerCase())
    return matchType && matchMonth && matchSearch
  }), [monthFilter, search, transactions, typeFilter])

  const currency = filtered[0]?.currency ?? 'EUR'
  const totalIn = filtered.filter((tx) => tx.type === 'in' && tx.status === 'Succès').reduce((sum, tx) => sum + tx.amount, 0)
  const totalOut = filtered.filter((tx) => tx.type === 'out' && tx.status === 'Succès').reduce((sum, tx) => sum + tx.amount, 0)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <BackLink to="/payments" label="Paiements" />
      <h2 className="text-xl font-bold text-slate-800">Historique des transactions</h2>
      {error && <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="mb-1 text-xs font-semibold text-emerald-600">Total reçu (levées)</p>
          <p className="text-xl font-bold text-emerald-700">+{formatCurrencyAmount(totalIn, currency)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-1 text-xs font-semibold text-slate-500">Total cotisé</p>
          <p className="text-xl font-bold text-slate-700">-{formatCurrencyAmount(totalOut, currency)}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une transaction…" className="w-full rounded-lg border border-slate-200 py-2.5 pr-4 pl-9 text-sm transition-colors focus:border-emerald-300 focus:outline-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Filter size={12} /> Type :</div>
          {([['all', 'Tout'], ['in', 'Reçu'], ['out', 'Cotisé']] as [TypeFilter, string][]).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTypeFilter(value)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-all', typeFilter === value ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>{label}</button>
          ))}
        </div>
        {months.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <div className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">Période :</div>
            {[['all', 'Tout'], ...months].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setMonthFilter(value)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-all', monthFilter === value ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>{label}</button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3">
          <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">{filtered.length} opération{filtered.length > 1 ? 's' : ''}</span>
        </div>
        {!transactions ? (
          <div className="space-y-3 p-4"><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400"><Search size={28} className="mx-auto mb-2 opacity-40" /><p className="text-sm">Aucune transaction trouvée</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((tx) => (
              <button key={tx.key} type="button" onClick={() => navigate(`/payments/history/${tx.kind}/${tx.id}`)} className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tx.type === 'in' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                  {tx.type === 'in' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-700">{tx.label}</p>
                  <p className="text-xs text-slate-400">{formatShortDate(tx.date)} {new Date(tx.date).getFullYear()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <div>
                    <p className={cn('text-sm font-bold', tx.type === 'in' ? 'text-emerald-600' : 'text-slate-700')}>{tx.type === 'in' ? '+' : '-'}{formatCurrencyAmount(tx.amount, tx.currency)}</p>
                    <p className={cn('text-xs', tx.statusTone === 'red' ? 'text-red-500' : 'text-slate-400')}>{tx.status}</p>
                  </div>
                  <ChevronRight size={15} className="text-slate-300 transition-colors group-hover:text-slate-500" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
