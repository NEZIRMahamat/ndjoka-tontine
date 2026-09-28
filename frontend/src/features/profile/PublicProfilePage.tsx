import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { CalendarCheck, MapPin, ShieldCheck, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BackLink, Panel, PanelHeader, SkeletonBlock, scoreTone } from '@/components/shared/page-primitives'
import { getPublicProfile, type PublicProfile } from '@/features/profile/public-profile-api'
import { BAND_LABELS, EXPERIENCE_LABELS } from '@/features/profile/saver-profile-api'
import { formatMonthYear } from '@/features/tontines/tontine-presentation'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const me = useCurrentUser()
  const { getAccessTokenSilently } = useAuth0()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    if (userId === me.id) {
      navigate('/profile', { replace: true })
      return
    }
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const result = await getPublicProfile(token, userId, controller.signal)
        if (active) setProfile(result)
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Membre introuvable.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, me.id, navigate, userId])

  if (error) {
    return (
      <div className="py-20 text-center text-slate-400">
        <p>{error}</p>
        <button type="button" onClick={() => navigate(-1)} className="mt-4 text-sm text-emerald-600 hover:underline">Retour</button>
      </div>
    )
  }
  if (!profile) return <div className="mx-auto max-w-2xl space-y-5"><SkeletonBlock className="h-6 w-24" /><SkeletonBlock className="h-44" /><SkeletonBlock className="h-56" /></div>

  const name = profile.display_name?.trim() || 'Membre Ndjoka'
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const score = Math.round(Number(profile.reliability.score) * 100)
  const tone = scoreTone(score)
  const ringColor = { emerald: 'text-emerald-500', blue: 'text-blue-500', amber: 'text-amber-400', red: 'text-red-400' }[tone]
  const circumference = 201
  const rel = profile.reliability
  const onTimeRate = rel.on_time_rate ? Math.round(Number(rel.on_time_rate) * 100) : null

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <BackLink label="Retour" />

      <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-xl border border-slate-100 bg-white p-6 shadow-sm sm:flex-row">
        <div className="absolute top-0 right-0 h-28 w-28 rounded-bl-full bg-emerald-50 opacity-60" />
        <Avatar className="h-24 w-24 shrink-0 border-4 border-white shadow-md">
          <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-3xl font-bold text-white">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="truncate text-xl font-bold text-slate-800">{name}</h2>
          <p className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-slate-400 sm:justify-start">
            <span>Membre depuis {formatMonthYear(profile.member_since)}</span>
            {profile.city && <span className="flex items-center gap-1"><MapPin size={12} /> {profile.city}</span>}
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Compte vérifié</span>
            {profile.experience_level && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{EXPERIENCE_LABELS[profile.experience_level]}</span>}
            {!rel.is_provisional && score >= 80 && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">Membre fiable</span>}
          </div>
        </div>
        <div className="shrink-0 text-center">
          <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Fiabilité</p>
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            <svg className="h-full w-full -rotate-90">
              <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100" />
              <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={circumference} strokeDashoffset={circumference - (circumference * score) / 100} strokeLinecap="round" className={ringColor} />
            </svg>
            <span className="absolute text-xl font-bold text-slate-800">{score}</span>
          </div>
          <p className={cn('mt-1 text-xs font-semibold', tone === 'red' ? 'text-red-500' : tone === 'amber' ? 'text-amber-600' : 'text-emerald-600')}>
            {rel.is_provisional ? 'Provisoire' : BAND_LABELS[rel.band]}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Users, label: 'tontines actives', value: profile.active_tontines },
          { icon: CalendarCheck, label: 'cycles terminés', value: profile.completed_cycles },
          { icon: ShieldCheck, label: 'à l’heure', value: onTimeRate === null ? '—' : `${onTimeRate}%` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-white p-3 text-center shadow-sm">
            <Icon size={16} className="mx-auto mb-1 text-slate-400" />
            <p className="text-lg font-bold text-slate-800">{value}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <Panel className="p-5">
        <h3 className="mb-2 text-sm font-bold tracking-wider text-slate-500 uppercase">Comment ce score est calculé</h3>
        <p className="text-sm leading-relaxed text-slate-600">{rel.explanation}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          {[['Suivies', rel.contributions_total], ['À l’heure', rel.contributions_on_time], ['En retard', rel.contributions_late], ['Non réglées', rel.contributions_outstanding]].map(([label, value]) => (
            <div key={String(label)}><p className="text-xs text-slate-400">{label}</p><p className="text-base font-bold text-slate-700">{value}</p></div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">Le score reflète uniquement la régularité des cotisations sur Ndjoka. Il est expliqué facteur par facteur et ne prend en compte ni les revenus ni aucune donnée bancaire.</p>
      </Panel>

      {profile.shared_tontines.length > 0 && (
        <Panel className="overflow-hidden">
          <PanelHeader title="Tontines en commun" />
          <ul className="divide-y divide-slate-100">
            {profile.shared_tontines.map((tontineName) => (
              <li key={tontineName} className="px-5 py-3 text-sm font-medium text-slate-700">{tontineName}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
