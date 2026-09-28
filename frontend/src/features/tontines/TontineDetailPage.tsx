import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Calendar, CheckCircle2, ChevronRight, Clock, Coins, Loader2, MapPin, Rocket, Settings2, Trophy, UserPlus, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useCurrentUser } from '@/app/current-user-context'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { BackLink, InitialsAvatar, Panel, PanelHeader, ProgressRing, ScoreChip, SkeletonBlock, StatusPill } from '@/components/shared/page-primitives'
import { CoverImage } from '@/components/shared/cover-image'
import { localQuote } from '@/features/fees/fees-api'
import { launchCycle, type CycleTurn } from '@/features/tontines/cycles-api'
import { isManagementRole, loadTontineOverview, membershipOfUser, type TontineOverview } from '@/features/tontines/tontine-data'
import {
  CATEGORY_META,
  ORDER_MODE_META,
  cycleFrequencyLabels,
  formatLongDate,
  formatMonthYear,
  formatShortDate,
  frequencyShortLabels,
  memberLabel,
  membershipRoleLabels,
  turnStatusOf,
} from '@/features/tontines/tontine-presentation'
import { getTontine } from '@/features/tontines/tontines-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

function RoundRow({ turn, overview, onClick }: { turn: CycleTurn; overview: TontineOverview; onClick: () => void }) {
  const { cycle, members, contributions } = overview
  if (!cycle) return null
  const beneficiary = members.find((member) => member.id === turn.beneficiary_membership_id)
  const rows = contributions.filter((item) => item.turn_id === turn.id && item.effective_status !== 'cancelled')
  const paid = rows.filter((item) => item.effective_status === 'confirmed').length
  const total = rows.length || members.filter((member) => member.status === 'active').length
  const status = turnStatusOf(turn, cycle, contributions)
  const isCurrent = status === 'current'
  const isCompleted = status === 'completed'
  const isUpcoming = status === 'upcoming'
  const hasData = rows.length > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-4 px-5 py-4 text-left transition-colors', isCurrent && 'bg-emerald-50/60', 'cursor-pointer hover:bg-slate-50', isUpcoming && 'opacity-70')}
    >
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold', isCompleted && 'bg-emerald-100 text-emerald-700', isCurrent && 'bg-emerald-600 text-white shadow', isUpcoming && 'bg-slate-100 text-slate-400')}>
        {isCompleted ? <CheckCircle2 size={18} /> : turn.position}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-800">{memberLabel(beneficiary)}</span>
          {isCurrent && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Tour en cours</span>}
          {isCompleted && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Terminé</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Calendar size={11} />{formatShortDate(turn.scheduled_for, cycle.timezone)} {new Date(turn.scheduled_for).getFullYear()}</span>
          {hasData ? <span>{paid}/{total} cotisations</span> : <span className="flex items-center gap-1"><Clock size={11} />À venir</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hasData && (
          <ProgressRing value={paid} total={total} size={34}>
            <span className="text-[9px] font-bold text-slate-600">{paid === total ? <Trophy size={10} className="text-emerald-600" /> : paid}</span>
          </ProgressRing>
        )}
        <ChevronRight size={15} className="text-slate-300" />
      </div>
    </button>
  )
}

export default function TontineDetailPage() {
  const { tontineId } = useParams<{ tontineId: string }>()
  const navigate = useNavigate()
  const profile = useCurrentUser()
  const confirm = useConfirm()
  const { getAccessTokenSilently } = useAuth0()
  const [overview, setOverview] = useState<TontineOverview | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [launching, setLaunching] = useState(false)

  useEffect(() => {
    if (!tontineId) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const tontine = await getTontine(token, tontineId, controller.signal)
        const result = await loadTontineOverview(token, tontine, controller.signal)
        if (active) setOverview(result)
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Tontine introuvable.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload, tontineId])

  const membership = overview ? membershipOfUser(overview, profile.id) : undefined
  const canManage = isManagementRole(membership?.role)
  const activeMembers = useMemo(() => overview?.members.filter((member) => member.status === 'active') ?? [], [overview])
  const cycle = overview?.cycle
  const orderedTurns = useMemo(() => (cycle ? [...cycle.turns].sort((a, b) => a.position - b.position) : []), [cycle])
  const currentTurn = cycle && overview ? orderedTurns.find((turn) => turnStatusOf(turn, cycle, overview.contributions) === 'current') : undefined
  const completedCount = cycle && overview ? orderedTurns.filter((turn) => turnStatusOf(turn, cycle, overview.contributions) === 'completed').length : 0
  const quote = cycle ? localQuote(Number(cycle.contribution_amount), activeMembers.length) : null
  const canLaunch = canManage && cycle !== undefined && ['draft', 'scheduled'].includes(cycle.status) && overview?.tontine.status !== 'archived'

  const launch = useCallback(async () => {
    if (!overview || !cycle) return
    if (activeMembers.length < 2) {
      toast.error('Invitez au moins un autre membre avant de lancer la tontine.')
      return
    }
    const seats = overview.tontine.max_members
    const confirmed = await confirm({
      title: 'Lancer la tontine ?',
      description: `${activeMembers.length} membre${activeMembers.length > 1 ? 's' : ''}${seats && activeMembers.length < seats ? ` sur ${seats} places` : ''}. L'ordre des tours sera établi (${ORDER_MODE_META[overview.tontine.order_mode].label.toLowerCase()}), puis les cotisations du premier tour seront attendues à partir du ${formatLongDate(cycle.start_date)}.`,
      confirmLabel: 'Lancer maintenant',
    })
    if (!confirmed) return
    setLaunching(true)
    try {
      const token = await getAccessTokenSilently()
      await launchCycle(token, overview.tontine.id, cycle.id)
      toast.success('La tontine est lancée ! Les membres ont été notifiés.')
      setReload((value) => value + 1)
    } catch (caught) {
      toast.error(messageOf(caught, 'Lancement impossible.'))
    } finally {
      setLaunching(false)
    }
  }, [activeMembers.length, confirm, cycle, getAccessTokenSilently, overview])

  if (error) {
    return (
      <div className="py-20 text-center text-slate-400">
        <p>{error}</p>
        <button type="button" onClick={() => navigate('/tontines')} className="mt-4 text-sm text-emerald-600 hover:underline">Retour à mes tontines</button>
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <BackLink to="/tontines" label="Mes Tontines" />
        <SkeletonBlock className="h-56" /><SkeletonBlock className="h-64" />
      </div>
    )
  }

  const { tontine } = overview
  const category = CATEGORY_META[tontine.category]
  const OrderIcon = ORDER_MODE_META[tontine.order_mode].icon

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <BackLink to="/tontines" label="Mes Tontines" />

      <Panel className="overflow-hidden">
        <div className="relative h-32 bg-slate-200">
          <CoverImage category={tontine.category} src={tontine.cover_image_url} className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-3 left-5 flex flex-wrap gap-1.5">
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', category.chip)}>{category.label}</span>
            {tontine.is_discoverable && <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700">Publique</span>}
          </div>
        </div>
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-800">{tontine.name}</h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                {cycle ? `Depuis ${formatMonthYear(cycle.start_date)}` : `Créée ${formatMonthYear(tontine.created_at)}`}
                {tontine.city && <span className="flex items-center gap-1"><MapPin size={12} /> {tontine.city}</span>}
              </p>
              {tontine.description && <p className="mt-2 text-sm text-slate-600">{tontine.description}</p>}
            </div>
            <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', membership?.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700')}>
              {membership ? membershipRoleLabels[membership.role] : 'Membre'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <Users size={16} className="mx-auto mb-1 text-slate-400" />
              <p className="text-lg font-bold text-slate-800">{activeMembers.length}{tontine.max_members ? <span className="text-sm font-medium text-slate-400">/{tontine.max_members}</span> : null}</p>
              <p className="text-xs text-slate-400">membres</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <Coins size={16} className="mx-auto mb-1 text-slate-400" />
              <p className="text-lg font-bold text-slate-800">{cycle ? formatCurrencyAmount(cycle.contribution_amount, tontine.currency) : '—'}</p>
              <p className="text-xs text-slate-400">{cycle ? cycleFrequencyLabels[cycle.frequency].toLowerCase() : 'cotisation'}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <Trophy size={16} className="mx-auto mb-1 text-emerald-500" />
              <p className="text-lg font-bold text-emerald-700">{quote ? formatCurrencyAmount(quote.net, tontine.currency) : '—'}</p>
              <p className="text-xs text-emerald-500">levée nette / tour</p>
            </div>
          </div>
          {quote && quote.feeTotal > 0 && (
            <p className="mt-2 text-center text-xs text-slate-400">
              Pot brut {formatCurrencyAmount(quote.gross, tontine.currency)} · frais Ndjoka {formatCurrencyAmount(quote.feeTotal, tontine.currency)} déduits du pot, dont {formatCurrencyAmount(quote.solidarity, tontine.currency)} pour le fonds de solidarité.
            </p>
          )}

          {currentTurn && cycle?.status === 'active' && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <p className="text-sm font-medium text-emerald-800">
                Tour {currentTurn.position} en cours : <span className="font-bold">{memberLabel(overview.members.find((member) => member.id === currentTurn.beneficiary_membership_id))}</span> bénéficie ce {cycle.frequency === 'monthly' ? 'mois-ci' : 'tour-ci'}
              </p>
            </div>
          )}

          {cycle && cycle.status === 'scheduled' && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <Clock size={16} className="shrink-0" />
              Le cycle démarre le <span className="font-bold">{formatLongDate(cycle.start_date)}</span>.
            </div>
          )}

          {cycle && cycle.status === 'draft' && (
            <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">Phase de recrutement</p>
              <p className="mt-0.5 text-xs text-amber-700">
                {tontine.max_members ? `${Math.max(0, tontine.max_members - activeMembers.length)} place${tontine.max_members - activeMembers.length > 1 ? 's' : ''} restante${tontine.max_members - activeMembers.length > 1 ? 's' : ''}. ` : ''}
                {canManage ? "Invitez vos membres puis lancez la tontine : l'ordre des tours sera établi selon la règle du groupe." : "L'organisateur lancera la tontine une fois le groupe réuni."}
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {canLaunch && (
              <button type="button" onClick={() => void launch()} disabled={launching} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-200 transition-colors hover:bg-emerald-700 disabled:opacity-60">
                {launching ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />} Lancer la tontine
              </button>
            )}
            {canManage && tontine.status !== 'archived' && (
              <button type="button" onClick={() => navigate(`/tontines/${tontine.id}/gestion?tab=invitations`)} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50">
                <UserPlus size={15} /> Inviter des membres
              </button>
            )}
            <button type="button" onClick={() => navigate(`/tontines/${tontine.id}/gestion`)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">
              <Settings2 size={15} /> {canManage ? 'Espace de gestion' : 'Détails et versements'}
            </button>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader title="Tours" aside={<span className="text-xs text-slate-400">{orderedTurns.length ? `${completedCount}/${orderedTurns.length} terminés` : 'Ordre établi au lancement'}</span>} />
        {orderedTurns.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            {cycle ? 'Le calendrier des tours sera établi au lancement de la tontine.' : 'Aucun cycle configuré pour cette tontine.'}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {orderedTurns.map((turn) => (
              <RoundRow key={turn.id} turn={turn} overview={overview} onClick={() => navigate(`/tontines/${tontine.id}/tour/${turn.id}`)} />
            ))}
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader title={`Membres (${activeMembers.length})`} />
        <div className="divide-y divide-slate-100">
          {activeMembers.map((member) => {
            const turn = orderedTurns.find((item) => item.beneficiary_membership_id === member.id)
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => navigate(member.user_id === profile.id ? '/profile' : `/members/${member.user_id}`)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <InitialsAvatar name={memberLabel(member)} />
                <span className="flex-1 truncate text-sm font-medium text-slate-700">{memberLabel(member)}</span>
                <ScoreChip score={member.reliability_score} provisional={member.reliability_provisional} />
                {member.role !== 'member' && <span className="hidden text-xs text-slate-400 sm:inline">{membershipRoleLabels[member.role]}</span>}
                {turn && <span className="text-xs text-slate-400">Tour {turn.position}</span>}
                {member.user_id === profile.id && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600">Vous</span>}
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel className="p-5">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-slate-500 uppercase">Règles du groupe</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 text-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400"><OrderIcon size={14} /></div>
            <div><p className="text-xs text-slate-400">Ordre de passage</p><p className="font-semibold text-slate-700">{ORDER_MODE_META[tontine.order_mode].label}</p></div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400"><Calendar size={14} /></div>
            <div><p className="text-xs text-slate-400">Rythme</p><p className="font-semibold text-slate-700">{cycle ? `${formatCurrencyAmount(cycle.contribution_amount, tontine.currency)} / ${frequencyShortLabels[cycle.frequency]}` : '—'}</p></div>
          </div>
        </div>
        {tontine.rules && (
          <ul className="mt-4 space-y-2">
            {tontine.rules.split(/(?<=\.)\s+/).filter(Boolean).map((rule, index) => (
              <li key={index} className="flex items-start gap-2.5 text-sm text-slate-600">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" /> {rule}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {tontine.late_penalty_enabled && <StatusPill tone="amber">Retards signalés au groupe</StatusPill>}
          {tontine.min_reliability_score && <StatusPill tone="purple">Score minimum {Math.round(Number(tontine.min_reliability_score) * 100)}/100</StatusPill>}
          {tontine.status === 'archived' && <StatusPill tone="slate">Tontine archivée</StatusPill>}
        </div>
      </Panel>
    </div>
  )
}
