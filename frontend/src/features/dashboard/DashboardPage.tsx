import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { AlertCircle, ArrowRight, Calendar, Compass, Plus, ShieldCheck, TrendingUp, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { ErrorNotice, SkeletonBlock } from '@/components/shared/page-primitives'
import { getMonthlyContributions, getMyContributions, getMyPayouts, type Contribution, type MonthlyContribution, type Payout } from '@/features/payments/payments-api'
import { BAND_LABELS, getReliability, type Reliability } from '@/features/profile/saver-profile-api'
import { loadMyTontineOverviews, membershipOfUser, type TontineOverview } from '@/features/tontines/tontine-data'
import { cycleProgressPercent, currentTurnOf, formatShortDate, frequencyShortLabels, membershipRoleLabels } from '@/features/tontines/tontine-presentation'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'

type DashboardData = {
  overviews: TontineOverview[]
  contributions: Contribution[]
  payouts: Payout[]
  reliability: Reliability
  monthly: MonthlyContribution[]
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

function SparklineChart({ chartData, currency }: { chartData: { name: string; amount: number }[]; currency: string }) {
  const W = 600
  const H = 200
  const PAD = { top: 16, right: 16, bottom: 28, left: 52 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const values = chartData.map((d) => d.amount)
  const minV = 0
  const maxV = Math.max(...values, 1)
  const range = maxV - minV || 1
  const xStep = chartData.length > 1 ? innerW / (chartData.length - 1) : innerW
  const toX = (index: number) => PAD.left + index * xStep
  const toY = (value: number) => PAD.top + innerH - ((value - minV) / range) * innerH
  const linePts = chartData.map((d, index) => `${toX(index)},${toY(d.amount)}`).join(' ')
  const areaPts = [`${toX(0)},${PAD.top + innerH}`, ...chartData.map((d, index) => `${toX(index)},${toY(d.amount)}`), `${toX(chartData.length - 1)},${PAD.top + innerH}`].join(' ')
  const yTicks = [minV, Math.round((minV + maxV) / 2), maxV]
  const [tooltip, setTooltip] = useState<{ x: number; y: number; d: (typeof chartData)[0] } | null>(null)

  return (
    <div className="relative h-52 w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Cotisations confirmées par mois">
        {yTicks.map((value) => (
          <g key={value}>
            <line x1={PAD.left} x2={W - PAD.right} y1={toY(value)} y2={toY(value)} stroke="#f1f5f9" strokeWidth="1" />
            <text x={PAD.left - 6} y={toY(value) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{value}</text>
          </g>
        ))}
        {chartData.map((d, index) => (
          <text key={d.name} x={toX(index)} y={H - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">{d.name}</text>
        ))}
        <polygon points={areaPts} fill="#10b981" fillOpacity="0.08" />
        <polyline points={linePts} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {chartData.map((d, index) => (
          <g key={d.name}>
            <circle cx={toX(index)} cy={toY(d.amount)} r="4" fill="#10b981" stroke="white" strokeWidth="2" />
            <rect
              x={toX(index) - xStep / 2}
              y={PAD.top}
              width={xStep}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setTooltip({ x: toX(index), y: toY(d.amount), d })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'crosshair' }}
            />
          </g>
        ))}
        {tooltip && (
          <g>
            <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={PAD.top + innerH} stroke="#10b981" strokeWidth="1" strokeDasharray="4 2" />
            <rect x={tooltip.x - 52} y={tooltip.y - 32} width="104" height="26" rx="6" fill="#1e293b" />
            <text x={tooltip.x} y={tooltip.y - 14} textAnchor="middle" fontSize="12" fill="white" fontWeight="600">
              {formatCurrencyAmount(tooltip.d.amount, currency)}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

function StatCard({ title, value, subtext, icon: Icon, color, positive }: { title: string; value: string; subtext: string; icon: typeof Wallet; color: string; positive?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div>
        <p className="mb-1 text-sm font-medium text-slate-500">{title}</p>
        <h3 className="mb-1 text-2xl font-bold text-slate-800">{value}</h3>
        <p className={`text-xs ${positive ? 'text-emerald-600' : 'text-slate-400'}`}>{subtext}</p>
      </div>
      <div className={`rounded-lg p-3 text-white ${color}`}>
        <Icon size={24} />
      </div>
    </motion.div>
  )
}

function TontineCard({ overview, userId, onClick }: { overview: TontineOverview; userId: string; onClick: () => void }) {
  const { tontine, cycle, contributions } = overview
  const membership = membershipOfUser(overview, userId)
  const progress = cycleProgressPercent(cycle, contributions)
  const nextTurn = cycle ? currentTurnOf(cycle, contributions) : undefined
  return (
    <button type="button" onClick={onClick} className="flex w-full flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 text-left transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate font-bold text-slate-800">{tontine.name}</h4>
          <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
            {membership ? membershipRoleLabels[membership.role] : 'Membre'}
          </span>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-slate-800">{cycle ? formatCurrencyAmount(cycle.contribution_amount, tontine.currency) : '—'}</p>
          <p className="text-xs text-slate-500">{cycle ? `par ${frequencyShortLabels[cycle.frequency]}` : 'à définir'}</p>
        </div>
      </div>
      <div className="mt-1">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Progression</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        <Calendar size={14} />
        <span>
          Prochain tour : <span className="font-medium text-slate-800">{nextTurn ? formatShortDate(nextTurn.scheduled_for, cycle?.timezone) : cycle?.status === 'draft' ? 'à lancer' : '—'}</span>
        </span>
      </div>
    </button>
  )
}

export default function DashboardPage() {
  const profile = useCurrentUser()
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const [overviews, contributions, payouts, reliability, monthly] = await Promise.all([
          loadMyTontineOverviews(token, controller.signal),
          getMyContributions(token, controller.signal, 0, 'asc'),
          getMyPayouts(token, controller.signal, 0, 'asc'),
          getReliability(token, controller.signal),
          getMonthlyContributions(token, controller.signal),
        ])
        if (active) setData({ overviews, contributions: contributions.items, payouts: payouts.items, reliability, monthly })
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Impossible de charger votre tableau de bord.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload])

  const firstName = (profile.display_name ?? profile.email ?? 'bienvenue').split(/[\s@]/)[0]
  const currency = data?.overviews[0]?.tontine.currency ?? 'EUR'

  const stats = useMemo(() => {
    if (!data) return null
    const confirmed = data.contributions.filter((item) => item.effective_status === 'confirmed')
    const totalSaved = confirmed.reduce((sum, item) => sum + Number(item.amount_due), 0)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonth = confirmed.filter((item) => item.confirmed_at && new Date(item.confirmed_at) >= monthStart).reduce((sum, item) => sum + Number(item.amount_due), 0)
    const nextPayout = data.payouts.filter((item) => ['pending', 'ready', 'approved', 'declared_paid'].includes(item.status)).sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0]
    const late = data.contributions.filter((item) => item.effective_status === 'late')
    const pending = data.contributions.filter((item) => item.effective_status === 'pending').sort((a, b) => a.due_at.localeCompare(b.due_at))
    const upcoming = data.overviews.filter((item) => item.cycle?.status === 'scheduled')
    return { totalSaved, thisMonth, nextPayout, late, pending, upcoming }
  }, [data])

  const chartData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 6 + index, 1)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const amount = data?.monthly.filter((item) => item.month.startsWith(key)).reduce((sum, item) => sum + Number(item.confirmed_amount), 0) ?? 0
      return { name: MONTHS[date.getMonth()], amount }
    })
  }, [data])

  const activeOverviews = data?.overviews.filter((item) => item.tontine.status !== 'archived').slice(0, 3) ?? []
  const reliabilityPercent = data ? Math.round(Number(data.reliability.score) * 100) : 0

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bonjour, {firstName} 👋</h1>
          <p className="text-slate-500">Voici un aperçu de vos activités d'épargne.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('/explore')} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <Compass size={18} /> Explorer
          </button>
          <button type="button" onClick={() => navigate('/tontines/create')} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-emerald-700">
            <Plus size={18} /> Créer une tontine
          </button>
        </div>
      </div>

      {error && <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />}

      {!data || !stats ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <SkeletonBlock className="h-28" /><SkeletonBlock className="h-28" /><SkeletonBlock className="h-28" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatCard
            title="Épargne totale"
            value={formatCurrencyAmount(stats.totalSaved, currency)}
            subtext={stats.thisMonth > 0 ? `+${formatCurrencyAmount(stats.thisMonth, currency)} ce mois-ci` : 'Cotisations confirmées cumulées'}
            positive={stats.thisMonth > 0}
            icon={Wallet}
            color="bg-blue-500"
          />
          <StatCard
            title="Prochaine levée"
            value={stats.nextPayout ? formatCurrencyAmount(stats.nextPayout.net_amount ?? stats.nextPayout.expected_amount, stats.nextPayout.currency) : '—'}
            subtext={stats.nextPayout ? `Prévue le ${formatShortDate(stats.nextPayout.scheduled_for)} · net de frais` : 'Aucun tour à venir en tant que bénéficiaire'}
            icon={TrendingUp}
            color="bg-emerald-500"
          />
          <StatCard
            title="Score de fiabilité"
            value={`${reliabilityPercent}/100`}
            subtext={data.reliability.is_provisional ? 'Score provisoire' : `${BAND_LABELS[data.reliability.band]} profil`}
            icon={ShieldCheck}
            color="bg-purple-500"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">Évolution de l'épargne</h3>
            <span className="rounded-lg bg-slate-50 px-3 py-1 text-sm text-slate-600">7 derniers mois</span>
          </div>
          {data ? <SparklineChart chartData={chartData} currency={currency} /> : <SkeletonBlock className="h-52" />}
          <p className="mt-3 text-xs text-slate-400">Montants des cotisations confirmées par le trésorier ou l'organisateur.</p>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">Tontines en cours</h3>
            <button type="button" onClick={() => navigate('/tontines')} className="flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline">
              Voir tout <ArrowRight size={14} />
            </button>
          </div>
          <div className="space-y-4">
            {!data ? (
              <><SkeletonBlock className="h-32" /><SkeletonBlock className="h-32" /></>
            ) : activeOverviews.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Vous ne participez à aucune tontine pour le moment.
                <button type="button" onClick={() => navigate('/explore')} className="mt-3 block w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">Explorer les tontines</button>
              </div>
            ) : (
              activeOverviews.map((overview) => (
                <TontineCard key={overview.tontine.id} overview={overview} userId={profile.id} onClick={() => navigate(`/tontines/${overview.tontine.id}`)} />
              ))
            )}
          </div>

          {stats && (stats.late.length > 0 || stats.upcoming.length > 0 || stats.pending.length > 0) && (
            <div className={`mt-2 flex gap-3 rounded-lg border p-4 ${stats.late.length > 0 ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50'}`}>
              <AlertCircle className={`shrink-0 ${stats.late.length > 0 ? 'text-red-600' : 'text-amber-600'}`} size={20} />
              <div>
                <p className={`text-sm font-medium ${stats.late.length > 0 ? 'text-red-800' : 'text-amber-800'}`}>Rappel important</p>
                <p className={`mt-1 text-xs ${stats.late.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                  {stats.late.length > 0
                    ? `${stats.late.length} cotisation${stats.late.length > 1 ? 's' : ''} en retard (${formatCurrencyAmount(stats.late.reduce((sum, item) => sum + Number(item.amount_due), 0), stats.late[0].currency ?? currency)}). Régularisez-les depuis Paiement.`
                    : stats.upcoming.length > 0 && stats.upcoming[0].cycle
                      ? `La tontine « ${stats.upcoming[0].tontine.name} » démarre le ${formatShortDate(stats.upcoming[0].cycle.start_date)}. N'oubliez pas votre premier versement.`
                      : `Prochaine cotisation de ${formatCurrencyAmount(stats.pending[0].amount_due, stats.pending[0].currency ?? currency)} pour « ${stats.pending[0].tontine_name ?? 'votre tontine'} » avant le ${formatShortDate(stats.pending[0].due_at)}.`}
                </p>
                <button type="button" onClick={() => navigate('/payments')} className="mt-2 text-xs font-bold text-slate-700 underline underline-offset-2">Voir mes paiements</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
