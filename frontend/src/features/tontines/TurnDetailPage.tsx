import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { AlertTriangle, Calendar, CheckCircle2, Clock, Loader2, Trophy, XCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useCurrentUser } from '@/app/current-user-context'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { BackLink, InitialsAvatar, Panel, PanelHeader, ScoreChip, SkeletonBlock } from '@/components/shared/page-primitives'
import { localQuote } from '@/features/fees/fees-api'
import { confirmContribution, declareContribution, rejectContribution, type Contribution } from '@/features/tontines/cycles-api'
import { isFinancialRole, loadTontineOverview, membershipOfUser, type TontineOverview } from '@/features/tontines/tontine-data'
import { daysUntil, formatLongDate, formatShortDate, memberLabel, turnStatusOf } from '@/features/tontines/tontine-presentation'
import { getTontine } from '@/features/tontines/tontines-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

type Visual = 'paid' | 'declared' | 'warning' | 'late' | 'pending' | 'rejected'

function visualOf(item: Contribution | undefined): Visual {
  if (!item) return 'pending'
  if (item.effective_status === 'confirmed') return 'paid'
  if (item.effective_status === 'declared') return 'declared'
  if (item.effective_status === 'late') return 'late'
  if (item.effective_status === 'rejected') return 'rejected'
  const days = daysUntil(item.due_at)
  return days <= 5 ? 'warning' : 'pending'
}

const VISUALS: Record<Visual, { label: string; icon: typeof Clock; bg: string; text: string; border: string; avatar: 'emerald' | 'blue' | 'amber' | 'red' | 'slate' }> = {
  paid: { label: 'Payé', icon: CheckCircle2, bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', avatar: 'emerald' },
  declared: { label: 'Déclaré · à confirmer', icon: Clock, bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', avatar: 'blue' },
  warning: { label: 'Échéance proche', icon: AlertTriangle, bg: 'bg-amber-50', text: 'text-amber-500', border: 'border-amber-200', avatar: 'amber' },
  late: { label: 'En retard', icon: XCircle, bg: 'bg-red-50', text: 'text-red-500', border: 'border-red-200', avatar: 'red' },
  rejected: { label: 'À corriger', icon: XCircle, bg: 'bg-red-50', text: 'text-red-500', border: 'border-red-200', avatar: 'red' },
  pending: { label: 'En attente', icon: Clock, bg: 'bg-slate-50', text: 'text-slate-400', border: 'border-slate-200', avatar: 'slate' },
}

const ORDER: Visual[] = ['late', 'rejected', 'warning', 'declared', 'pending', 'paid']

export default function TurnDetailPage() {
  const { tontineId, turnId } = useParams<{ tontineId: string; turnId: string }>()
  const navigate = useNavigate()
  const profile = useCurrentUser()
  const confirm = useConfirm()
  const { getAccessTokenSilently } = useAuth0()
  const [overview, setOverview] = useState<TontineOverview | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState('')
  const [declaring, setDeclaring] = useState(false)
  const [rejectingId, setRejectingId] = useState('')

  useEffect(() => {
    if (!tontineId) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const tontine = await getTontine(token, tontineId, controller.signal)
        const result = await loadTontineOverview(token, tontine, controller.signal)
        if (active) setOverview(result)
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Tour introuvable.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload, tontineId])

  const cycle = overview?.cycle
  const turn = cycle?.turns.find((item) => item.id === turnId)
  const membership = overview ? membershipOfUser(overview, profile.id) : undefined
  const canReview = isFinancialRole(membership?.role)

  const rows = useMemo(() => {
    if (!overview || !turn) return []
    const active = overview.members.filter((member) => member.status === 'active')
    const byMember = new Map(overview.contributions.filter((item) => item.turn_id === turn.id).map((item) => [item.membership_id, item]))
    return active
      .map((member) => ({ member, contribution: byMember.get(member.id), visual: visualOf(byMember.get(member.id)) }))
      .filter((row) => row.contribution?.effective_status !== 'cancelled')
      .sort((a, b) => ORDER.indexOf(a.visual) - ORDER.indexOf(b.visual))
  }, [overview, turn])

  async function run(key: string, work: (token: string) => Promise<unknown>, success: string) {
    setBusy(key)
    try {
      const token = await getAccessTokenSilently()
      await work(token)
      toast.success(success)
      setReload((value) => value + 1)
    } catch (caught) {
      toast.error(messageOf(caught, 'Action impossible.'))
    } finally {
      setBusy('')
    }
  }

  async function declare(event: FormEvent<HTMLFormElement>, contributionId: string) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run(contributionId, (token) => declareContribution(token, contributionId, {
      declaration_reference: String(data.get('reference') ?? '').trim() || null,
      declaration_note: String(data.get('note') ?? '').trim() || null,
    }), 'Cotisation déclarée. Le trésorier va la confirmer.')
    setDeclaring(false)
  }

  async function reject(event: FormEvent<HTMLFormElement>, contributionId: string) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
    if (reason.length < 3) return
    await run(contributionId, (token) => rejectContribution(token, contributionId, reason), 'Déclaration rejetée, le membre est informé.')
    setRejectingId('')
  }

  if (error || (overview && (!cycle || !turn))) {
    return (
      <div className="py-20 text-center text-slate-400">
        <p>{error || 'Tour introuvable.'}</p>
        <button type="button" onClick={() => navigate(`/tontines/${tontineId}`)} className="mt-4 text-sm text-emerald-600 hover:underline">Retour à la tontine</button>
      </div>
    )
  }
  if (!overview || !cycle || !turn) {
    return <div className="mx-auto max-w-2xl space-y-5"><SkeletonBlock className="h-6 w-40" /><SkeletonBlock className="h-56" /><SkeletonBlock className="h-64" /></div>
  }

  const { tontine } = overview
  const beneficiary = overview.members.find((member) => member.id === turn.beneficiary_membership_id)
  const status = turnStatusOf(turn, cycle, overview.contributions)
  const total = rows.length
  const paid = rows.filter((row) => row.visual === 'paid').length
  const late = rows.filter((row) => row.visual === 'late' || row.visual === 'rejected').length
  const warning = rows.filter((row) => row.visual === 'warning').length
  const declared = rows.filter((row) => row.visual === 'declared').length
  const isComplete = total > 0 && paid === total
  const quote = localQuote(Number(cycle.contribution_amount), total)
  const payout = overview.payouts.find((item) => item.turn_id === turn.id)
  const hasObligations = rows.some((row) => row.contribution)
  const mine = rows.find((row) => row.member.user_id === profile.id)?.contribution
  const canDeclareMine = mine && ['pending', 'rejected', 'late'].includes(mine.effective_status) && tontine.status !== 'archived'
  const isBeneficiary = membership?.id === turn.beneficiary_membership_id

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <BackLink to={`/tontines/${tontine.id}`} label={tontine.name} />

      <Panel className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Tour {turn.position}/{cycle.turns.length}</span>
              {status === 'current' && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> En cours</span>}
              {status === 'completed' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Terminé</span>}
              {status === 'upcoming' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">À venir</span>}
            </div>
            <h2 className="text-xl font-bold text-slate-800">{memberLabel(beneficiary)}{isBeneficiary ? ' (vous)' : ''}</h2>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-400"><Calendar size={13} /> {formatLongDate(turn.scheduled_for, cycle.timezone)}</p>
          </div>
          <div className="relative flex shrink-0 items-center justify-center">
            <svg width="60" height="60" className="-rotate-90">
              <circle cx="30" cy="30" r="24" fill="none" stroke="#e2e8f0" strokeWidth="4" />
              <circle cx="30" cy="30" r="24" fill="none" stroke={isComplete ? '#10b981' : paid > 0 ? '#f59e0b' : '#e2e8f0'} strokeWidth="4" strokeDasharray={150.8} strokeDashoffset={150.8 * (1 - (total ? paid / total : 0))} strokeLinecap="round" />
            </svg>
            <div className="absolute text-center">
              {isComplete ? <Trophy size={18} className="mx-auto text-emerald-600" /> : <span className="text-sm font-bold text-slate-700">{paid}<span className="text-xs text-slate-400">/{total}</span></span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Payé', value: paid, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'En retard', value: late, color: 'text-red-500', bg: 'bg-red-50' },
            { label: 'Déclaré', value: declared, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'En attente', value: Math.max(0, total - paid - late - declared - warning) + warning, color: 'text-slate-400', bg: 'bg-slate-50' },
          ].map((stat) => (
            <div key={stat.label} className={cn('rounded-xl p-2.5 text-center', stat.bg)}>
              <p className={cn('text-lg font-bold', stat.color)}>{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-slate-500">Pot brut du tour</span><span className="font-semibold text-slate-700">{formatCurrencyAmount(quote.gross, tontine.currency)}</span></div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400"><span>Frais Ndjoka déduits (dont {formatCurrencyAmount(quote.solidarity, tontine.currency)} fonds de solidarité)</span><span>− {formatCurrencyAmount(quote.feeTotal, tontine.currency)}</span></div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2"><span className="font-bold text-emerald-700">Le bénéficiaire reçoit</span><span className="text-lg font-bold text-emerald-700">{formatCurrencyAmount(quote.net, tontine.currency)}</span></div>
          {payout && <p className="mt-2 text-xs text-slate-400">Versement : {({ pending: 'en attente des cotisations', ready: 'prêt à être approuvé', approved: 'approuvé', declared_paid: 'transfert déclaré', received: 'réception confirmée', disputed: 'contesté', cancelled: 'annulé' } as Record<string, string>)[payout.status]}.</p>}
        </div>

        {isComplete && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <Trophy size={18} className="shrink-0 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-800">
              Tous les membres ont cotisé : la cagnotte de <strong>{formatCurrencyAmount(quote.net, tontine.currency)}</strong> est prête pour {memberLabel(beneficiary)} !
            </p>
          </div>
        )}

        {canDeclareMine && mine && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-800">Votre cotisation de {formatCurrencyAmount(mine.amount_due, tontine.currency)} {mine.effective_status === 'late' ? 'est en retard' : mine.effective_status === 'rejected' ? 'a été rejetée' : `est attendue avant le ${formatShortDate(mine.due_at)}`}</p>
            {mine.rejection_reason && <p className="mt-1 text-xs text-amber-700">Motif : {mine.rejection_reason}</p>}
            {!declaring ? (
              <button type="button" onClick={() => setDeclaring(true)} className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-700">Déclarer mon paiement</button>
            ) : (
              <form onSubmit={(event) => void declare(event, mine.id)} className="mt-3 space-y-2">
                <input name="reference" placeholder="Référence du virement (optionnel)" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" maxLength={255} />
                <input name="note" placeholder="Note pour le trésorier (optionnel)" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" maxLength={500} />
                <div className="flex gap-2">
                  <button type="submit" disabled={busy === mine.id} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{busy === mine.id && <Loader2 size={14} className="animate-spin" />} Confirmer ma déclaration</button>
                  <button type="button" onClick={() => setDeclaring(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">Annuler</button>
                </div>
                <p className="text-xs text-amber-700">Le transfert est réalisé avec votre moyen de paiement habituel ; Ndjoka enregistre et fait confirmer la cotisation.</p>
              </form>
            )}
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader title="Cotisations des membres" aside={canReview ? <span className="text-xs text-slate-400">Vous pouvez confirmer les déclarations</span> : undefined} />
        {!hasObligations ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Les cotisations de ce tour seront créées au lancement de la tontine.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(({ member, contribution, visual }) => {
              const config = VISUALS[visual]
              const Icon = config.icon
              const isSelf = member.user_id === profile.id
              const reviewable = canReview && contribution?.effective_status === 'declared' && tontine.status !== 'archived'
              return (
                <div key={member.id} className={cn('px-5 py-3.5', isSelf && 'bg-blue-50/40')}>
                  <div className="flex items-center gap-4">
                    <InitialsAvatar name={memberLabel(member)} className="h-9 w-9" tone={config.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => navigate(isSelf ? '/profile' : `/members/${member.user_id}`)} className="truncate text-sm font-semibold text-slate-700 hover:text-emerald-700 hover:underline">{memberLabel(member)}</button>
                        <ScoreChip score={member.reliability_score} provisional={member.reliability_provisional} />
                        {isSelf && <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-600">Vous</span>}
                        {member.id === turn.beneficiary_membership_id && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">Bénéficiaire</span>}
                      </div>
                      {contribution?.confirmed_at && <span className="text-xs text-slate-400">Payé le {formatShortDate(contribution.confirmed_at)}</span>}
                      {contribution?.effective_status === 'declared' && contribution.declared_at && <span className="text-xs text-slate-400">Déclaré le {formatShortDate(contribution.declared_at)}{contribution.declaration_reference ? ` · réf. ${contribution.declaration_reference}` : ''}</span>}
                      {(visual === 'pending' || visual === 'warning' || visual === 'late') && contribution && <span className="text-xs text-slate-400">Échéance {formatShortDate(contribution.due_at)}</span>}
                    </div>
                    <div className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', config.bg, config.text, config.border)}>
                      <Icon size={14} /><span className="hidden sm:inline">{config.label}</span>
                    </div>
                  </div>
                  {reviewable && contribution && (
                    <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
                      <button
                        type="button"
                        disabled={busy === contribution.id}
                        onClick={async () => {
                          const ok = await confirm({ title: `Confirmer la cotisation de ${memberLabel(member)} ?`, description: `${formatCurrencyAmount(contribution.amount_due, tontine.currency)} seront comptabilisés pour ce tour.`, confirmLabel: 'Confirmer' })
                          if (ok) void run(contribution.id, (token) => confirmContribution(token, contribution.id), 'Cotisation confirmée.')
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busy === contribution.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Confirmer
                      </button>
                      {rejectingId === contribution.id ? (
                        <form onSubmit={(event) => void reject(event, contribution.id)} className="flex flex-1 flex-wrap gap-2">
                          <input name="reason" required minLength={3} placeholder="Motif du rejet" className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-emerald-400 focus:outline-none" />
                          <button type="submit" className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600">Rejeter</button>
                          <button type="button" onClick={() => setRejectingId('')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Annuler</button>
                        </form>
                      ) : (
                        <button type="button" onClick={() => setRejectingId(contribution.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Rejeter</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
