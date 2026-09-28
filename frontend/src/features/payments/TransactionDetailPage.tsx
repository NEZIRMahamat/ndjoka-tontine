import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, Copy, Loader2, XCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useConfirm } from '@/components/shared/confirm-dialog'
import { BackLink, SkeletonBlock } from '@/components/shared/page-primitives'
import { confirmPayoutReceipt, disputePayout, getContribution, getPayout } from '@/features/payments/payments-api'
import { contributionToTransaction, payoutToTransaction, type Transaction } from '@/features/payments/payments-presentation'
import { getTontine } from '@/features/tontines/tontines-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

export default function TransactionDetailPage() {
  const { type, operationId } = useParams<{ type: string; operationId: string }>()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { getAccessTokenSilently } = useAuth0()
  const [tx, setTx] = useState<Transaction | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [disputing, setDisputing] = useState(false)

  useEffect(() => {
    if (!operationId || (type !== 'contribution' && type !== 'payout')) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        if (type === 'contribution') {
          const item = await getContribution(token, operationId, controller.signal)
          if (active) setTx(contributionToTransaction(item))
        } else {
          const item = await getPayout(token, operationId, controller.signal)
          const tontine = await getTontine(token, item.tontine_id, controller.signal).catch(() => null)
          if (active) setTx(payoutToTransaction(item, tontine?.name ?? null))
        }
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Transaction introuvable.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, operationId, reload, type])

  async function act(work: (token: string) => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      const token = await getAccessTokenSilently()
      await work(token)
      toast.success(success)
      setReload((value) => value + 1)
    } catch (caught) {
      toast.error(messageOf(caught, 'Action impossible.'))
    } finally {
      setBusy(false)
      setDisputing(false)
    }
  }

  if (error || type === undefined || (type !== 'contribution' && type !== 'payout')) {
    return (
      <div className="py-20 text-center text-slate-400">
        <p>{error || 'Transaction introuvable.'}</p>
        <button type="button" onClick={() => navigate('/payments/history')} className="mt-4 text-sm text-emerald-600 hover:underline">Retour</button>
      </div>
    )
  }
  if (!tx) return <div className="mx-auto max-w-lg space-y-5"><SkeletonBlock className="h-6 w-28" /><SkeletonBlock className="h-56" /><SkeletonBlock className="h-64" /></div>

  const StatusIcon = tx.status === 'Succès' ? CheckCircle2 : ['En attente', 'Déclaré'].includes(tx.status) ? Clock : XCircle
  const statusColor = tx.statusTone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : tx.statusTone === 'amber' || tx.statusTone === 'blue' ? 'border-amber-200 bg-amber-50 text-amber-600' : tx.statusTone === 'red' ? 'border-red-200 bg-red-50 text-red-500' : 'border-slate-200 bg-slate-50 text-slate-500'
  const payout = tx.kind === 'payout' ? tx.raw as Extract<Transaction['raw'], { scheduled_for: string }> : null
  const canConfirmReceipt = payout && 'status' in payout && payout.status === 'declared_paid'
  const reference = tx.kind === 'contribution' && 'declaration_reference' in tx.raw ? null : null
  const date = new Date(tx.date)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <BackLink to="/payments/history" label="Historique" />

      <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <div className={cn('mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl', tx.type === 'in' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
          {tx.type === 'in' ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
        </div>
        <p className="mb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">{tx.type === 'in' ? 'Montant reçu (net de frais)' : 'Montant de la cotisation'}</p>
        <p className={cn('text-4xl font-bold', tx.type === 'in' ? 'text-emerald-600' : 'text-slate-800')}>{tx.type === 'in' ? '+' : '-'}{formatCurrencyAmount(tx.amount, tx.currency)}</p>
        <div className={cn('mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold', statusColor)}><StatusIcon size={13} /> {tx.status}</div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3"><span className="text-xs font-bold tracking-wider text-slate-500 uppercase">Détails de l'opération</span></div>
        <div className="divide-y divide-slate-50">
          {[
            ['Libellé', tx.label],
            ['Tontine', tx.tontineName ?? '—'],
            ['Date', date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })],
            ['Type', tx.type === 'in' ? 'Crédit (levée)' : 'Débit (cotisation)'],
            ['Méthode', tx.method],
            ['Catégorie', tx.category],
          ].map(([key, value]) => (
            <div key={key} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="text-slate-500">{key}</span>
              <span className="max-w-[60%] truncate text-right font-semibold text-slate-700">{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-slate-500">Référence Ndjoka</span>
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-slate-100 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">NDJ-{tx.id.slice(0, 8).toUpperCase()}</span>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(tx.id); toast.success('Référence copiée') }} className="p-1 text-slate-400 transition-colors hover:text-emerald-600" aria-label="Copier la référence"><Copy size={13} /></button>
            </div>
          </div>
          {reference}
        </div>
      </div>

      {tx.note && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <p className="mb-1 text-xs font-bold tracking-wider text-amber-600 uppercase">Note</p>
          <p className="text-sm text-amber-800">{tx.note}</p>
        </div>
      )}

      {canConfirmReceipt && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-bold text-emerald-800">Le trésorier a déclaré vous avoir versé cette levée. Confirmez-vous l'avoir reçue ?</p>
          {!disputing ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={async () => { if (await confirm({ title: 'Confirmer la réception ?', confirmLabel: 'Oui, reçue' })) void act((token) => confirmPayoutReceipt(token, tx.id), 'Réception confirmée. Merci !') }} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{busy && <Loader2 size={14} className="animate-spin" />} Confirmer la réception</button>
              <button type="button" onClick={() => setDisputing(true)} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Je n'ai rien reçu</button>
            </div>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim(); if (reason.length >= 3) void act((token) => disputePayout(token, tx.id, reason), "Contestation enregistrée, l'organisateur est informé.") }} className="space-y-2">
              <textarea name="reason" required minLength={3} rows={2} placeholder="Expliquez ce qui ne correspond pas" className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none" />
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60">Contester</button>
                <button type="button" onClick={() => setDisputing(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">Annuler</button>
              </div>
            </form>
          )}
        </div>
      )}

      {tx.tontineId && <button type="button" onClick={() => navigate(`/tontines/${tx.tontineId}`)} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">Voir la tontine</button>}
      <button type="button" onClick={() => navigate('/payments')} className="w-full rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">Retour aux paiements</button>
    </div>
  )
}
