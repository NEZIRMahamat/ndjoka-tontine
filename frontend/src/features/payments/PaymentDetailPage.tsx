import { useAuth0 } from '@auth0/auth0-react'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getContribution, getPayout, type Contribution, type Payout } from '@/features/payments/payments-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'

type Operation =
  | { type: 'contribution'; item: Contribution }
  | { type: 'payout'; item: Payout }

export default function PaymentDetailPage() {
  const { type, operationId } = useParams()
  const { getAccessTokenSilently } = useAuth0()
  const [operation, setOperation] = useState<Operation | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!operationId || (type !== 'contribution' && type !== 'payout')) {
      return
    }
    const controller = new AbortController()
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const result: Operation = type === 'contribution'
          ? { type, item: await getContribution(token, operationId, controller.signal) }
          : { type, item: await getPayout(token, operationId, controller.signal) }
        if (active) setOperation(result)
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Détail indisponible'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false; controller.abort() }
  }, [getAccessTokenSilently, operationId, type, reload])

  if (type !== 'contribution' && type !== 'payout') {
    return <p role="alert" className="p-6 text-sm text-destructive">Type d’opération inconnu.</p>
  }

  const isPayout = operation?.type === 'payout'
  const item = operation?.item
  const amount = operation
    ? operation.type === 'payout' ? operation.item.approved_amount ?? operation.item.expected_amount : operation.item.amount_due
    : ''
  const currency = item?.currency ?? null

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to="/paiements/historique" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Historique</Link>
      {loading ? <Skeleton className="h-64 w-full" /> : error || !operation ? (
        <Card><CardContent className="space-y-4 p-8 text-center">
          <p role="alert" className="text-sm text-destructive">{error || 'Opération introuvable.'}</p>
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>Réessayer</Button>
        </CardContent></Card>
      ) : (
        <>
          <Card><CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <span className={`grid h-14 w-14 place-items-center rounded-2xl ${isPayout ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
              {isPayout ? <ArrowDownLeft /> : <ArrowUpRight />}
            </span>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{isPayout ? 'Versement bénéficiaire' : 'Cotisation'}</p>
            <h1 className="text-3xl font-bold tabular-nums">{formatCurrencyAmount(amount, currency)}</h1>
            <StatusBadge status={operation.type === 'payout' ? operation.item.status : operation.item.effective_status} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Détails de l’opération</CardTitle></CardHeader>
            <CardContent className="divide-y text-sm">
              <Detail label="Identifiant" value={item?.id ?? ''} />
              <Detail label="Tontine" value={operation.type === 'contribution' ? operation.item.tontine_name ?? operation.item.tontine_id ?? '—' : operation.item.tontine_id} />
              <Detail label="Cycle" value={operation.type === 'contribution' ? operation.item.cycle_name ?? operation.item.cycle_id : operation.item.cycle_id} />
              <Detail label="Date prévue" value={new Date(operation.type === 'payout' ? operation.item.scheduled_for : operation.item.due_at).toLocaleDateString('fr-FR')} />
              {operation.type === 'contribution' && operation.item.confirmed_at && <Detail label="Confirmée le" value={new Date(operation.item.confirmed_at).toLocaleDateString('fr-FR')} />}
              {operation.type === 'payout' && operation.item.received_at && <Detail label="Réception confirmée le" value={new Date(operation.item.received_at).toLocaleDateString('fr-FR')} />}
              {operation.type === 'contribution' && operation.item.rejection_reason && <Detail label="Motif de rejet" value={operation.item.rejection_reason} />}
            </CardContent>
          </Card>
          {item?.tontine_id && <Button asChild variant="outline" className="w-full"><Link to={`/tontines/${item.tontine_id}`}>Voir la tontine</Link></Button>}
          <Button asChild variant="outline" className="w-full"><Link to="/paiements">Retour aux paiements</Link></Button>
        </>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap justify-between gap-2 py-3"><span className="text-muted-foreground">{label}</span><span className="max-w-full break-all text-right font-medium">{value}</span></div>
}
