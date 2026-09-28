import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Calendar, CheckCircle2, Clock, Globe, Loader2, Lock, MapPin, ShieldCheck, Sparkles, Users, Wallet, XCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useConfirm } from '@/components/shared/confirm-dialog'
import { CoverImage } from '@/components/shared/cover-image'
import { BackLink, InitialsAvatar, ScoreChip, SkeletonBlock } from '@/components/shared/page-primitives'
import { getDiscoverableMembers, getDiscoveredTontine, joinTontine, type DiscoveredMember, type DiscoveredTontine } from '@/features/explorer/discovery-api'
import { localQuote } from '@/features/fees/fees-api'
import { CATEGORY_META, ORDER_MODE_META, cycleFrequencyLabels, formatLongDate, formatMonthYear, frequencyShortLabels, membershipRoleLabels } from '@/features/tontines/tontine-presentation'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

export default function ExploreTontineDetailPage() {
  const { tontineId } = useParams<{ tontineId: string }>()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { getAccessTokenSilently } = useAuth0()
  const [tontine, setTontine] = useState<DiscoveredTontine | null>(null)
  const [members, setMembers] = useState<DiscoveredMember[] | null>(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!tontineId) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const item = await getDiscoveredTontine(token, tontineId, controller.signal)
        if (active) setTontine(item)
        const list = await getDiscoverableMembers(token, tontineId, controller.signal).catch(() => [] as DiscoveredMember[])
        if (active) setMembers(list)
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Tontine introuvable ou non ouverte.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, tontineId])

  async function handleJoin() {
    if (!tontine) return
    const confirmed = await confirm({
      title: `Rejoindre « ${tontine.name} » ?`,
      description: `Vous vous engagez à verser ${tontine.contribution_amount ? formatCurrencyAmount(tontine.contribution_amount, tontine.currency) : 'la cotisation'} ${tontine.frequency ? `par ${frequencyShortLabels[tontine.frequency]}` : ''} pendant toute la durée du cycle, y compris après avoir reçu votre tour.`,
      confirmLabel: 'Rejoindre',
    })
    if (!confirmed) return
    setJoining(true)
    try {
      const token = await getAccessTokenSilently()
      await joinTontine(token, tontine.id)
      toast.success('Bienvenue dans la tontine !', { description: `Vous êtes maintenant membre de « ${tontine.name} ».` })
      navigate(`/tontines/${tontine.id}`)
    } catch (caught) {
      toast.error(messageOf(caught, 'Adhésion impossible.'))
      setJoining(false)
    }
  }

  if (error) {
    return (
      <div className="py-20 text-center text-slate-400">
        <p>{error}</p>
        <button type="button" onClick={() => navigate('/explore')} className="mt-4 text-sm text-emerald-600 hover:underline">Retour à l'exploration</button>
      </div>
    )
  }
  if (!tontine) {
    return <div className="mx-auto max-w-3xl space-y-5"><SkeletonBlock className="h-6 w-32" /><SkeletonBlock className="h-64" /><SkeletonBlock className="h-40" /></div>
  }

  const total = tontine.max_members ?? tontine.member_count
  const spotsLeft = tontine.seats_left
  const fillPct = total ? Math.round((tontine.member_count / total) * 100) : 0
  const category = CATEGORY_META[tontine.category]
  const OrderIcon = ORDER_MODE_META[tontine.order_mode].icon
  const quote = tontine.contribution_amount ? localQuote(Number(tontine.contribution_amount), total) : null
  const affinity = Math.round(Number(tontine.affinity_score) * 100)
  const canJoin = tontine.is_eligible && (spotsLeft === null || spotsLeft > 0)
  const rules = tontine.rules ? tontine.rules.split(/(?<=\.)\s+/).filter(Boolean) : []

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink to="/explore" label="Explorer" />

      <div className="relative h-52 overflow-hidden rounded-2xl shadow-sm sm:h-64">
        <CoverImage category={tontine.category} src={tontine.cover_image_url} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute right-5 bottom-4 left-5 flex items-end justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', category.chip)}>{category.label}</span>
              {tontine.min_reliability_score && <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">Membres vérifiés</span>}
            </div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">{tontine.name}</h1>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-white/70"><MapPin size={12} /> {tontine.city ?? 'France'}</p>
          </div>
          {tontine.contribution_amount && (
            <div className="shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white shadow-lg">
              {formatCurrencyAmount(tontine.contribution_amount, tontine.currency)} / {tontine.frequency ? frequencyShortLabels[tontine.frequency] : 'tour'}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-2 font-bold text-slate-800">À propos</h2>
            <p className="text-sm leading-relaxed text-slate-600">{tontine.description ?? 'Cette tontine n’a pas encore de description.'}</p>
            {tontine.goal && <p className="mt-3 text-sm text-slate-500"><span className="font-semibold text-slate-700">Objectif :</span> {tontine.goal}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Wallet, label: 'Levée nette / tour', value: quote ? formatCurrencyAmount(quote.net, tontine.currency) : '—', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { icon: Users, label: 'Membres', value: `${tontine.member_count} / ${tontine.max_members ?? '∞'}`, color: 'text-blue-600', bg: 'bg-blue-50' },
              { icon: Clock, label: 'Places restantes', value: spotsLeft === null ? 'Illimité' : spotsLeft > 0 ? `${spotsLeft} dispo.` : 'Complet', color: spotsLeft === null || spotsLeft > 0 ? 'text-teal-600' : 'text-red-500', bg: spotsLeft === null || spotsLeft > 0 ? 'bg-teal-50' : 'bg-red-50' },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-white p-3.5 text-center shadow-sm">
                <div className={cn('mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg', bg)}><Icon size={16} className={color} /></div>
                <p className={cn('text-sm font-bold', color)}>{value}</p>
                <p className="text-xs text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex justify-between text-sm">
              <span className="font-semibold text-slate-700">Remplissage du groupe</span>
              <span className="font-bold text-emerald-600">{fillPct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all" style={{ width: `${fillPct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {spotsLeft === null ? 'Groupe sans limite de places' : spotsLeft > 0 ? `${spotsLeft} place${spotsLeft > 1 ? 's' : ''} disponible${spotsLeft > 1 ? 's' : ''}` : 'Groupe complet'}
              {tontine.start_date && ` · démarrage prévu le ${formatLongDate(tontine.start_date)}`}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800"><Sparkles size={16} className="text-violet-500" /> Affinité avec votre profil : {affinity}%</h3>
            <ul className="space-y-2">
              {tontine.reasons.map((reason) => (
                <li key={reason.criterion} className="flex items-start gap-2.5 text-sm text-slate-600">
                  {reason.matched ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" /> : <XCircle size={15} className="mt-0.5 shrink-0 text-slate-300" />}
                  {reason.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-bold tracking-wider text-slate-500 uppercase"><Users size={15} /> Membres ({tontine.member_count})</h3>
              <span className="text-xs text-slate-400">Avec qui vous ferez tontine</span>
            </div>
            {members === null ? (
              <div className="space-y-3 p-5"><SkeletonBlock className="h-10" /><SkeletonBlock className="h-10" /><SkeletonBlock className="h-10" /></div>
            ) : members.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-400">Aucun membre pour le moment : vous seriez parmi les premiers.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {members.map((member) => (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => navigate(`/members/${member.user_id}`)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <InitialsAvatar name={member.display_name ?? 'Membre'} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-700">{member.display_name ?? 'Membre Ndjoka'}</p>
                      <p className="truncate text-xs text-slate-400">
                        {membershipRoleLabels[member.role]}
                        {member.city ? ` · ${member.city}` : ''}
                        {` · membre depuis ${formatMonthYear(member.member_since)}`}
                      </p>
                    </div>
                    {member.turn_position !== null && <span className="hidden text-xs text-slate-400 sm:inline">Tour {member.turn_position}</span>}
                    <ScoreChip score={member.reliability_score} provisional={member.reliability_provisional} />
                  </button>
                ))}
              </div>
            )}
            {spotsLeft !== null && spotsLeft > 0 && (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">{spotsLeft} place{spotsLeft > 1 ? 's' : ''} encore disponible{spotsLeft > 1 ? 's' : ''}. Seuls le nom, la ville, l'ancienneté et le score de fiabilité des membres sont visibles.</p>
            )}
          </div>

          {(rules.length > 0 || tontine.late_penalty_enabled) && (
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-3 font-bold text-slate-800">Règlement</h3>
              <ul className="space-y-2">
                {rules.map((rule, index) => (
                  <li key={index} className="flex items-start gap-2.5 text-sm text-slate-600"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" /> {rule}</li>
                ))}
                {tontine.late_penalty_enabled && <li className="flex items-start gap-2.5 text-sm text-slate-600"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" /> Les retards de cotisation sont signalés au groupe et pèsent sur le score de fiabilité.</li>}
                <li className="flex items-start gap-2.5 text-sm text-slate-600"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" /> Engagement à cotiser jusqu'à la fin du cycle, y compris après avoir reçu son tour.</li>
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="sticky top-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="mb-1 text-xs text-slate-400">Cotisation</p>
            <p className="mb-0.5 text-2xl font-bold text-slate-800">
              {tontine.contribution_amount ? formatCurrencyAmount(tontine.contribution_amount, tontine.currency) : '—'}
              {tontine.frequency && <span className="text-sm font-normal text-slate-400"> / {frequencyShortLabels[tontine.frequency]}</span>}
            </p>
            {quote && (
              <>
                <p className="text-sm font-semibold text-emerald-700">Levée nette : {formatCurrencyAmount(quote.net, tontine.currency)}</p>
                <p className="mb-4 text-xs text-slate-400">Pot brut {formatCurrencyAmount(quote.gross, tontine.currency)} moins {formatCurrencyAmount(quote.feeTotal, tontine.currency)} de frais Ndjoka</p>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleJoin()}
              disabled={!canJoin || joining}
              className={cn('flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all', canJoin ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100 hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-100 text-slate-400')}
            >
              {joining && <Loader2 size={15} className="animate-spin" />}
              {spotsLeft !== null && spotsLeft <= 0 ? 'Groupe complet' : !tontine.is_eligible ? 'Score de fiabilité insuffisant' : 'Rejoindre la tontine'}
            </button>
            {!tontine.is_eligible && tontine.ineligibility_reason && <p className="mt-2 text-center text-xs text-red-500">{tontine.ineligibility_reason} (minimum {Math.round(Number(tontine.min_reliability_score) * 100)}/100)</p>}
            {canJoin && <p className="mt-2 text-center text-xs text-slate-400">Adhésion immédiate · engagement sur toute la durée du cycle</p>}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-bold text-slate-700">Détails</h3>
            {[
              { icon: OrderIcon, label: 'Ordre de passage', value: ORDER_MODE_META[tontine.order_mode].label },
              { icon: Globe, label: 'Accès', value: 'Publique' },
              { icon: Calendar, label: 'Rythme', value: tontine.frequency ? cycleFrequencyLabels[tontine.frequency] : 'À définir' },
              { icon: Lock, label: 'Fiabilité exigée', value: tontine.min_reliability_score ? `${Math.round(Number(tontine.min_reliability_score) * 100)}/100 minimum` : 'Ouverte à tous' },
              { icon: Calendar, label: 'Créée', value: formatMonthYear(tontine.created_at) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50"><Icon size={14} className="text-slate-400" /></div>
                <div><p className="text-xs text-slate-400">{label}</p><p className="text-xs font-semibold text-slate-700">{value}</p></div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-700">Organisateur</h3>
            <div className="flex items-center gap-3">
              <InitialsAvatar name={tontine.organizer_name ?? 'Organisateur'} className="h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-600 text-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-700">{tontine.organizer_name ?? 'Organisateur vérifié'}</p>
                <p className="text-xs text-slate-400">{tontine.organizer_since ? `Membre Ndjoka depuis ${formatMonthYear(tontine.organizer_since)}` : 'Membre Ndjoka'}</p>
              </div>
              <ShieldCheck size={16} className="ml-auto shrink-0 text-emerald-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
