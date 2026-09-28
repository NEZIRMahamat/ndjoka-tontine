import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, CreditCard, History, Landmark, MoreHorizontal, Plus, ShieldCheck, Smartphone } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { ErrorNotice, SkeletonBlock } from '@/components/shared/page-primitives'
import { getMyContributions, getMyPayouts, type Contribution, type Payout } from '@/features/payments/payments-api'
import { contributionToTransaction, payoutToTransaction, sortByDateDesc, type Transaction } from '@/features/payments/payments-presentation'
import { listPaymentMethods, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/features/profile/payment-methods-api'
import { loadAllMyTontines } from '@/features/tontines/tontine-data'
import { formatShortDate } from '@/features/tontines/tontine-presentation'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

type PaymentData = { contributions: Contribution[]; payouts: Payout[]; tontineNames: Map<string, string>; methods: PaymentMethod[] }

const METHOD_ICONS = { card: CreditCard, sepa: Landmark, mobile_money: Smartphone }
const METHOD_TONES = { card: 'bg-slate-100 text-slate-600', sepa: 'bg-blue-100 text-blue-600', mobile_money: 'bg-orange-100 text-orange-600' }

export default function PaymentsPage() {
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const [data, setData] = useState<PaymentData | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const [contributions, payouts, tontines, methods] = await Promise.all([
          getMyContributions(token, controller.signal, 0, 'desc'),
          getMyPayouts(token, controller.signal, 0, 'desc'),
          loadAllMyTontines(token, controller.signal),
          listPaymentMethods(token, controller.signal).catch(() => [] as PaymentMethod[]),
        ])
        if (active) setData({ contributions: contributions.items, payouts: payouts.items, tontineNames: new Map(tontines.map((item) => [item.id, item.name])), methods })
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Impossible de charger vos paiements.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload])

  const transactions = useMemo<Transaction[]>(() => {
    if (!data) return []
    return sortByDateDesc([
      ...data.contributions.map(contributionToTransaction),
      ...data.payouts.map((item) => payoutToTransaction(item, data.tontineNames.get(item.tontine_id) ?? null)),
    ])
  }, [data])

  const totals = useMemo(() => {
    const currency = data?.contributions[0]?.currency ?? data?.payouts[0]?.currency ?? 'EUR'
    const saved = data?.contributions.filter((item) => item.effective_status === 'confirmed').reduce((sum, item) => sum + Number(item.amount_due), 0) ?? 0
    const received = data?.payouts.filter((item) => item.status === 'received').reduce((sum, item) => sum + Number(item.net_amount ?? item.expected_amount), 0) ?? 0
    const due = data?.contributions.filter((item) => ['pending', 'late', 'rejected'].includes(item.effective_status)) ?? []
    const dueAmount = due.reduce((sum, item) => sum + Number(item.amount_due), 0)
    const late = due.filter((item) => item.effective_status === 'late').length
    const nextDue = [...due].sort((a, b) => a.due_at.localeCompare(b.due_at))[0]
    return { currency, saved, received, dueAmount, dueCount: due.length, late, nextDue }
  }, [data])

  const defaultMethod = data?.methods.find((method) => method.is_default) ?? data?.methods[0]
  const recent = transactions.slice(0, 5)

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Portefeuille & Paiements</h2>
        <button type="button" onClick={() => navigate('/profile/payment-methods')} className="flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline">
          <MoreHorizontal size={16} /> Gérer les méthodes
        </button>
      </div>

      {error && <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />}

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 rounded-full bg-white/5 p-32 blur-3xl" />
        <div className="relative z-10 flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="mb-1 font-medium text-slate-400">Épargne cotisée</p>
            {!data ? <SkeletonBlock className="mb-4 h-10 w-40 bg-white/10" /> : <h3 className="mb-1 text-4xl font-bold">{formatCurrencyAmount(totals.saved, totals.currency)}</h3>}
            <p className="mb-4 text-sm text-slate-400">
              {data ? `${formatCurrencyAmount(totals.received, totals.currency)} déjà reçus en levées · ${totals.dueCount} cotisation${totals.dueCount > 1 ? 's' : ''} à venir (${formatCurrencyAmount(totals.dueAmount, totals.currency)})` : ''}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate(totals.nextDue?.tontine_id ? `/tontines/${totals.nextDue.tontine_id}` : '/tontines')}
                className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors', totals.late > 0 ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-emerald-500 text-white hover:bg-emerald-600')}
              >
                <Plus size={16} /> {totals.late > 0 ? `Régulariser (${totals.late} en retard)` : totals.nextDue ? `Cotiser · ${formatShortDate(totals.nextDue.due_at)}` : 'Aucune cotisation due'}
              </button>
              <button type="button" onClick={() => navigate('/payments/history')} className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/20">
                <ArrowUpRight size={16} /> Historique
              </button>
            </div>
          </div>
          <div className="text-left md:text-right">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm md:ml-auto">
              <CreditCard size={24} />
            </div>
            <p className="text-sm text-slate-400">{defaultMethod ? `${PAYMENT_METHOD_LABELS[defaultMethod.type]} · ${defaultMethod.label}` : 'Moyen de paiement'}</p>
            <p className="font-mono text-lg tracking-wider">{defaultMethod ? `**** ${defaultMethod.last4}` : 'Aucun déclaré'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(data?.methods ?? []).slice(0, 3).map((method) => {
          const Icon = METHOD_ICONS[method.type]
          return (
            <button key={method.id} type="button" onClick={() => navigate('/profile/payment-methods')} className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:border-emerald-200">
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-full transition-transform group-hover:scale-110', METHOD_TONES[method.type])}><Icon size={20} /></div>
              <span className="text-sm font-medium text-slate-600">{method.label}</span>
              <span className="text-xs text-slate-400">•••• {method.last4}{method.is_default ? ' · défaut' : ''}</span>
            </button>
          )
        })}
        <button type="button" onClick={() => navigate('/profile/payment-methods')} className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors group-hover:text-emerald-500"><Plus size={20} /></div>
          <span className="text-sm font-medium text-slate-400">Ajouter</span>
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
        <p>
          Ndjoka ne détient jamais votre argent. Les cotisations vont directement au bénéficiaire du tour ; seuls les frais de service (3 % à 1 %, plafonnés à 10 € par cotisation) sont déduits du pot.{' '}
          <button type="button" onClick={() => navigate('/frais')} className="font-semibold underline underline-offset-2">Voir le barème</button>
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800"><History size={20} className="text-slate-400" /> Historique des transactions</h3>
          <button type="button" onClick={() => navigate('/payments/history')} className="text-sm font-medium text-emerald-600 hover:underline">Voir tout</button>
        </div>
        {!data ? (
          <div className="space-y-3 p-4"><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /></div>
        ) : recent.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">Aucune transaction pour le moment. Rejoignez une tontine pour commencer.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((tx) => (
              <button key={tx.key} type="button" onClick={() => navigate(`/payments/history/${tx.kind}/${tx.id}`)} className="group flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tx.type === 'in' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                    {tx.type === 'in' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{tx.label}</p>
                    <p className="text-xs text-slate-500">{formatShortDate(tx.date)} {new Date(tx.date).getFullYear()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <div>
                    <p className={cn('text-sm font-bold', tx.type === 'in' ? 'text-emerald-600' : 'text-slate-700')}>{tx.type === 'in' ? '+' : '-'}{formatCurrencyAmount(tx.amount, tx.currency)}</p>
                    <p className={cn('text-xs', tx.statusTone === 'red' ? 'text-red-500' : 'text-slate-400')}>{tx.status}</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 transition-colors group-hover:text-slate-500" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
