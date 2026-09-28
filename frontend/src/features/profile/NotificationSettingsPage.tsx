import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/app/current-user-context'
import { BackLink, SkeletonBlock, Toggle } from '@/components/shared/page-primitives'
import { DEFAULT_PREFERENCES, getNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '@/features/profile/notification-preferences-api'
import { messageOf } from '@/lib/http'

const CHANNELS: Array<{ key: keyof NotificationPreferences; label: string; detail: (email: string | null, phone: string | null) => string }> = [
  { key: 'channel_email', label: 'E-mail', detail: (email) => email ?? 'Adresse non renseignée' },
  { key: 'channel_sms', label: 'SMS', detail: (_, phone) => phone ?? 'Ajoutez un téléphone dans vos informations personnelles' },
  { key: 'channel_push', label: 'Notifications push', detail: () => 'Sur votre appareil (bientôt disponible)' },
]

const PREFERENCES: Array<{ key: keyof NotificationPreferences; label: string; desc: string }> = [
  { key: 'payment_reminders', label: 'Rappels de paiement', desc: 'Rappel 3 jours avant la date de cotisation' },
  { key: 'payments_received', label: 'Paiements reçus', desc: 'Confirmation à chaque cotisation validée' },
  { key: 'late_payments', label: 'Retards de paiement', desc: "Alerte si un membre n'a pas payé à temps" },
  { key: 'payouts', label: 'Levées & virements', desc: "Notification quand c'est votre tour de recevoir" },
  { key: 'new_members', label: 'Nouveaux membres', desc: "Quand quelqu'un rejoint votre tontine" },
  { key: 'newsletter', label: 'Actualités Ndjoka', desc: 'Conseils épargne et nouvelles fonctionnalités' },
]

export default function NotificationSettingsPage() {
  const profile = useCurrentUser()
  const { getAccessTokenSilently } = useAuth0()
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const saved = await getNotificationPreferences(token, controller.signal)
        if (active) setPrefs(saved)
      } catch {
        if (active) setPrefs(DEFAULT_PREFERENCES)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently])

  const toggle = (key: keyof NotificationPreferences) => setPrefs((current) => (current ? { ...current, [key]: !current[key] } : current))

  async function save() {
    if (!prefs) return
    setSaving(true)
    try {
      const token = await getAccessTokenSilently()
      setPrefs(await saveNotificationPreferences(token, prefs))
      toast.success('Préférences enregistrées')
    } catch (caught) {
      toast.error(messageOf(caught, 'Enregistrement impossible.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <BackLink to="/profile" label="Mon Profil" />

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5"><h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Canaux</h3></div>
        {!prefs ? <div className="space-y-3 p-5"><SkeletonBlock className="h-12" /><SkeletonBlock className="h-12" /></div> : (
          <div className="divide-y divide-slate-100">
            {CHANNELS.map((channel) => (
              <div key={channel.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div><p className="text-sm font-semibold text-slate-700">{channel.label}</p><p className="text-xs text-slate-400">{channel.detail(profile.email, profile.phone)}</p></div>
                <Toggle on={prefs[channel.key]} onClick={() => toggle(channel.key)} label={channel.label} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5"><h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Préférences</h3></div>
        {!prefs ? <div className="space-y-3 p-5"><SkeletonBlock className="h-12" /><SkeletonBlock className="h-12" /><SkeletonBlock className="h-12" /></div> : (
          <div className="divide-y divide-slate-100">
            {PREFERENCES.map((pref) => (
              <div key={pref.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex-1"><p className="text-sm font-semibold text-slate-700">{pref.label}</p><p className="text-xs text-slate-400">{pref.desc}</p></div>
                <Toggle on={prefs[pref.key]} onClick={() => toggle(pref.key)} label={pref.label} />
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" onClick={() => void save()} disabled={!prefs || saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60">
        {saving && <Loader2 size={16} className="animate-spin" />} Enregistrer
      </button>
    </div>
  )
}
