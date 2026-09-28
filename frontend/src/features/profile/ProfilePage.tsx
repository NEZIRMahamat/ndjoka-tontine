import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Bell, ChevronRight, CreditCard, LogOut, Settings, Shield, Sparkles, User, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BAND_LABELS, getReliability, getSaverProfile, type Reliability } from '@/features/profile/saver-profile-api'
import { formatMonthYear } from '@/features/tontines/tontine-presentation'
import { cn } from '@/lib/utils'

function SettingRow({ icon: Icon, color, bg, title, subtitle, onClick, badge }: { icon: LucideIcon; color: string; bg: string; title: string; subtitle?: string; onClick: () => void; badge?: string }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-slate-50">
      <div className="flex items-center gap-4">
        <div className={cn('rounded-lg p-2 transition-colors', bg, color)}><Icon size={18} /></div>
        <div className="text-left">
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{badge}</span>}
        <ChevronRight size={15} className="shrink-0 text-slate-300 transition-colors group-hover:text-slate-400" />
      </div>
    </button>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const profile = useCurrentUser()
  const { user, logout, getAccessTokenSilently } = useAuth0()
  const [reliability, setReliability] = useState<Reliability | null>(null)
  const [hasSaverProfile, setHasSaverProfile] = useState<boolean | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const [score, saver] = await Promise.all([getReliability(token, controller.signal), getSaverProfile(token, controller.signal)])
        if (active) {
          setReliability(score)
          setHasSaverProfile(saver !== null)
        }
      } catch {
        if (active) setHasSaverProfile(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently])

  const name = profile.display_name?.trim() || user?.name || profile.email || 'Membre Ndjoka'
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const score = reliability ? Math.round(Number(reliability.score) * 100) : null
  const circumference = 201

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-xl border border-slate-100 bg-white p-6 shadow-sm sm:flex-row">
        <div className="absolute top-0 right-0 h-28 w-28 rounded-bl-full bg-emerald-50 opacity-60" />
        <div className="relative shrink-0">
          <Avatar className="h-24 w-24 border-4 border-white shadow-md">
            <AvatarImage src={profile.avatar_url ?? user?.picture} alt="" />
            <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-3xl font-bold text-white">{initials}</AvatarFallback>
          </Avatar>
          <button type="button" onClick={() => navigate('/profile/info')} className="absolute right-1 bottom-1 rounded-full bg-emerald-600 p-1.5 text-white shadow transition-colors hover:bg-emerald-700" aria-label="Modifier mon profil">
            <Settings size={13} />
          </button>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="truncate text-xl font-bold text-slate-800">{name}</h2>
          <p className="mb-3 text-sm text-slate-400">Membre depuis {formatMonthYear(profile.created_at)}</p>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Compte vérifié</span>
            {profile.global_role !== 'user' && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">{profile.global_role === 'platform_admin' ? 'Administrateur' : 'Support'}</span>}
            {reliability && !reliability.is_provisional && score !== null && score >= 80 && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">Membre fiable</span>}
          </div>
        </div>
        <button type="button" onClick={() => navigate('/profile/savings')} className="shrink-0 text-center">
          <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Fiabilité</p>
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            <svg className="h-full w-full -rotate-90">
              <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100" />
              <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={circumference} strokeDashoffset={circumference - (circumference * (score ?? 0)) / 100} strokeLinecap="round" className={cn(score !== null && score >= 65 ? 'text-emerald-500' : 'text-amber-400')} />
            </svg>
            <span className="absolute text-xl font-bold text-slate-800">{score ?? '…'}</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-emerald-600">{reliability ? (reliability.is_provisional ? 'Provisoire' : BAND_LABELS[reliability.band]) : ''}</p>
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-sm font-bold tracking-wider text-slate-500 uppercase">Mon épargne</h3>
        <div className="divide-y divide-slate-100">
          <SettingRow icon={Sparkles} color="text-violet-600" bg="bg-violet-50" title="Profil d'épargnant et score" subtitle="Capacité, rythme, objectif · alimente vos recommandations" onClick={() => navigate('/profile/savings')} badge={hasSaverProfile === false ? 'À compléter' : undefined} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-sm font-bold tracking-wider text-slate-500 uppercase">Paramètres du compte</h3>
        <div className="divide-y divide-slate-100">
          <SettingRow icon={User} color="text-blue-600" bg="bg-blue-50" title="Informations personnelles" subtitle="Nom, e-mail, téléphone, adresse" onClick={() => navigate('/profile/info')} />
          <SettingRow icon={CreditCard} color="text-emerald-600" bg="bg-emerald-50" title="Moyens de paiement" subtitle="Cartes, prélèvement SEPA, Mobile Money" onClick={() => navigate('/profile/payment-methods')} />
          <SettingRow icon={Shield} color="text-purple-600" bg="bg-purple-50" title="Sécurité & Confidentialité" subtitle="Mot de passe, connexion, données personnelles" onClick={() => navigate('/profile/security')} />
          <SettingRow icon={Bell} color="text-amber-600" bg="bg-amber-50" title="Notifications" subtitle="E-mail, SMS, notifications push" onClick={() => navigate('/profile/notifications')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center text-xs sm:grid-cols-4">
        {[['/a-propos', 'À propos'], ['/equipe', "L'équipe"], ['/cgu', 'CGU'], ['/confidentialite', 'Confidentialité']].map(([to, label]) => (
          <button key={to} type="button" onClick={() => navigate(to)} className="rounded-lg border border-slate-100 bg-white py-2.5 font-semibold text-slate-500 transition-colors hover:border-emerald-200 hover:text-emerald-700">{label}</button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-3.5 text-sm font-semibold text-red-500 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50"
      >
        <LogOut size={17} /> Déconnexion
      </button>
    </div>
  )
}
