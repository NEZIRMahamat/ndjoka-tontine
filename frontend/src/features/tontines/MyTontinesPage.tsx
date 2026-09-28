import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { AlertTriangle, CheckCircle, ChevronRight, Plus, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { ErrorNotice, InitialsAvatar, SkeletonBlock } from '@/components/shared/page-primitives'
import { loadAllMyContributions, loadMyTontineOverviews, membershipOfUser, type TontineOverview } from '@/features/tontines/tontine-data'
import {
  CATEGORY_META,
  cycleFrequencyLabels,
  cycleProgressPercent,
  currentTurnOf,
  formatShortDate,
  memberLabel,
  membershipRoleLabels,
} from '@/features/tontines/tontine-presentation'
import type { Contribution } from '@/features/tontines/cycles-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

function statusChip(overview: TontineOverview): { label: string; className: string } {
  if (overview.tontine.status === 'archived') return { label: 'Terminée', className: 'bg-slate-100 text-slate-500' }
  if (overview.cycle?.status === 'active') return { label: 'En cours', className: 'bg-emerald-100 text-emerald-700' }
  if (overview.cycle?.status === 'scheduled') return { label: 'Démarre bientôt', className: 'bg-blue-100 text-blue-700' }
  if (overview.cycle?.status === 'completed') return { label: 'Cycle terminé', className: 'bg-slate-100 text-slate-500' }
  return { label: 'Recrutement', className: 'bg-amber-100 text-amber-700' }
}

function TontineCard({ overview, userId, onClick }: { overview: TontineOverview; userId: string; onClick: () => void }) {
  const { tontine, cycle, members, contributions } = overview
  const membership = membershipOfUser(overview, userId)
  const activeMembers = members.filter((member) => member.status === 'active')
  const progress = cycleProgressPercent(cycle, contributions)
  const currentTurn = cycle ? currentTurnOf(cycle, contributions) : undefined
  const myTurn = cycle && membership ? cycle.turns.find((turn) => turn.beneficiary_membership_id === membership.id)?.position : undefined
  const chip = statusChip(overview)
  const category = CATEGORY_META[tontine.category]

  return (
    <motion.div
      whileHover={{ scale: 1.005 }}
      onClick={onClick}
      role="link"
      tabIndex={0}
      onKeyDown={(event) => event.key === 'Enter' && onClick()}
      className="cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
    >
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-xl font-bold text-slate-800">{tontine.name}</h3>
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Users size={16} /> {activeMembers.length} membre{activeMembers.length > 1 ? 's' : ''}
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              {cycle ? cycleFrequencyLabels[cycle.frequency] : 'Cycle à définir'}
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', category.chip)}>{category.label}</span>
            </p>
          </div>
          <span className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-bold', chip.className)}>{chip.label}</span>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-1 text-xs text-slate-500">Cotisation</p>
            <p className="font-bold text-slate-800">{cycle ? formatCurrencyAmount(cycle.contribution_amount, tontine.currency) : '—'}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-1 text-xs text-slate-500">Tour actuel</p>
            <p className="font-bold text-emerald-600">{cycle && cycle.turns.length ? `Tour ${currentTurn?.position ?? cycle.turns.length}/${cycle.turns.length}` : '—'}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-1 text-xs text-slate-500">Mon tour</p>
            <p className="font-bold text-slate-800">{myTurn ? `Tour ${myTurn}` : '—'}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-1 text-xs text-slate-500">Rôle</p>
            <p className="font-bold text-slate-800">{membership ? membershipRoleLabels[membership.role] : 'Membre'}</p>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex justify-between text-xs text-slate-500">
            <span>Progression</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-3.5">
        <div className="flex -space-x-2">
          {activeMembers.slice(0, 4).map((member) => (
            <div key={member.id} className="rounded-full border-2 border-white">
              <InitialsAvatar name={memberLabel(member)} className="h-8 w-8 bg-emerald-100 text-emerald-700" />
            </div>
          ))}
          {activeMembers.length > 4 && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-xs font-bold text-slate-500">+{activeMembers.length - 4}</div>
          )}
        </div>
        <span className="flex items-center gap-1 text-sm font-bold text-emerald-600">
          Voir les tours <ChevronRight size={16} />
        </span>
      </div>
    </motion.div>
  )
}

export default function MyTontinesPage() {
  const navigate = useNavigate()
  const profile = useCurrentUser()
  const { getAccessTokenSilently } = useAuth0()
  const [overviews, setOverviews] = useState<TontineOverview[] | null>(null)
  const [myContributions, setMyContributions] = useState<Contribution[]>([])
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const [items, contributions] = await Promise.all([
          loadMyTontineOverviews(token, controller.signal),
          loadAllMyContributions(token, controller.signal),
        ])
        if (active) {
          setOverviews(items)
          setMyContributions(contributions)
        }
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Impossible de charger vos tontines.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload])

  const sorted = useMemo(() => {
    if (!overviews) return []
    const rank = (item: TontineOverview) => (item.tontine.status === 'archived' ? 3 : item.cycle?.status === 'active' ? 0 : item.cycle?.status === 'scheduled' ? 1 : 2)
    return [...overviews].sort((left, right) => rank(left) - rank(right))
  }, [overviews])

  const [now] = useState(() => Date.now())
  const dueSoon = useMemo(() => {
    return myContributions
      .filter((item) => item.effective_status === 'late' || (item.effective_status === 'pending' && new Date(item.due_at).getTime() - now < 7 * 86_400_000))
      .sort((a, b) => a.due_at.localeCompare(b.due_at))[0]
  }, [myContributions, now])
  const dueOverview = dueSoon ? overviews?.find((item) => item.cycle?.id === dueSoon.cycle_id) : undefined
  const dueTurnStatus = dueSoon && dueOverview?.cycle ? dueOverview.cycle.turns.find((turn) => turn.id === dueSoon.turn_id) : undefined

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <h2 className="text-2xl font-bold text-slate-800">Mes Tontines</h2>
        <button type="button" onClick={() => navigate('/tontines/create')} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-200 transition-colors hover:bg-emerald-700">
          <Plus size={16} /> Créer une tontine
        </button>
      </div>

      {error && <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />}

      {dueSoon && (
        <div className={cn('flex items-start gap-3 rounded-xl border p-4', dueSoon.effective_status === 'late' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50')}>
          <AlertTriangle className={cn('mt-1 shrink-0', dueSoon.effective_status === 'late' ? 'text-red-600' : 'text-amber-600')} size={20} />
          <div>
            <h4 className={cn('font-bold', dueSoon.effective_status === 'late' ? 'text-red-800' : 'text-amber-800')}>
              {dueSoon.effective_status === 'late' ? 'Paiement en retard' : 'Paiement en attente'}
            </h4>
            <p className={cn('mt-1 text-sm', dueSoon.effective_status === 'late' ? 'text-red-700' : 'text-amber-700')}>
              Vous avez une cotisation de <span className="font-bold">{formatCurrencyAmount(dueSoon.amount_due, dueOverview?.tontine.currency ?? 'EUR')}</span>
              {dueOverview ? ` pour « ${dueOverview.tontine.name} »` : ''}. {dueSoon.effective_status === 'late' ? 'Échéance dépassée le' : 'À régler avant le'} {formatShortDate(dueSoon.due_at)}.
            </p>
            <button
              type="button"
              onClick={() => navigate(dueOverview && dueTurnStatus ? `/tontines/${dueOverview.tontine.id}/tour/${dueTurnStatus.id}` : '/payments')}
              className={cn('mt-3 rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors', dueSoon.effective_status === 'late' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700')}
            >
              Payer maintenant
            </button>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {!overviews ? (
          <><SkeletonBlock className="h-64" /><SkeletonBlock className="h-64" /></>
        ) : (
          sorted.map((overview) => (
            <TontineCard key={overview.tontine.id} overview={overview} userId={profile.id} onClick={() => navigate(`/tontines/${overview.tontine.id}`)} />
          ))
        )}
      </div>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle size={32} />
        </div>
        <h3 className="mb-2 text-xl font-bold text-slate-800">Rejoindre une tontine ?</h3>
        <p className="mx-auto mb-6 max-w-md text-slate-600">
          Trouvez une tontine qui correspond à vos objectifs ou créez la vôtre et invitez votre réseau.
        </p>
        <button type="button" onClick={() => navigate('/explore')} className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-200 transition-colors hover:bg-emerald-700">
          Explorer les tontines
        </button>
      </div>
    </div>
  )
}
