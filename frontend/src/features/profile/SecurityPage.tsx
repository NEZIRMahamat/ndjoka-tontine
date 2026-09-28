import { useAuth0 } from '@auth0/auth0-react'
import { Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useCurrentUser } from '@/app/current-user-context'
import { BackLink } from '@/components/shared/page-primitives'
import { formatLongDate } from '@/features/tontines/tontine-presentation'

export default function SecurityPage() {
  const navigate = useNavigate()
  const profile = useCurrentUser()
  const { user, loginWithRedirect } = useAuth0()
  const connection = profile.sub.split('|')[0]
  const isSocial = connection !== 'auth0'
  const providerLabel = connection === 'google-oauth2' ? 'Google' : connection === 'auth0' ? 'e-mail et mot de passe' : connection

  async function resetPassword() {
    if (isSocial) {
      toast.info(`Votre mot de passe est géré par ${providerLabel}.`)
      return
    }
    const domain = (import.meta.env.VITE_AUTH0_DOMAIN ?? '').trim()
    const clientId = (import.meta.env.VITE_AUTH0_CLIENT_ID ?? '').trim()
    const email = profile.email ?? user?.email
    if (!domain || !clientId || !email) {
      toast.error('Impossible de lancer la réinitialisation pour le moment.')
      return
    }
    try {
      const response = await fetch(`https://${domain}/dbconnections/change_password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, email, connection: 'Username-Password-Authentication' }),
      })
      if (!response.ok) throw new Error('Réponse inattendue du service de connexion')
      toast.success('Un e-mail de réinitialisation vous a été envoyé.')
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Envoi impossible.')
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <BackLink to="/profile" label="Mon Profil" />

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
          <h2 className="flex items-center gap-2 font-bold text-slate-800"><LockKeyhole size={16} /> Connexion</h2>
        </div>
        <div className="divide-y divide-slate-100">
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Fingerprint size={20} /></div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700">Méthode de connexion</p>
              <p className="text-xs text-slate-400">Compte {providerLabel}{profile.email ? ` · ${profile.email}` : ''}</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600"><ShieldCheck size={12} /> Sécurisé</span>
          </div>
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600"><KeyRound size={20} /></div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700">Mot de passe</p>
              <p className="text-xs text-slate-400">{isSocial ? `Géré par ${providerLabel}` : 'Recevez un lien sécurisé par e-mail pour le modifier'}</p>
            </div>
            <button type="button" onClick={() => void resetPassword()} disabled={isSocial} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50">Modifier</button>
          </div>
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck size={20} /></div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700">Double authentification (2FA)</p>
              <p className="text-xs text-slate-400">Protégez votre compte avec une vérification supplémentaire à la connexion</p>
            </div>
            <button type="button" onClick={() => void loginWithRedirect({ authorizationParams: { prompt: 'login' }, appState: { returnTo: '/profile/security' } })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50">Configurer</button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
          <h2 className="font-bold text-slate-800">Confidentialité et données</h2>
        </div>
        <div className="space-y-3 p-5 text-sm text-slate-600">
          <p>Votre compte a été créé le <span className="font-semibold text-slate-800">{formatLongDate(profile.created_at)}</span>. Les autres membres de vos tontines voient uniquement votre nom, votre position dans l'ordre des tours et le statut de vos cotisations.</p>
          <p>Vos coordonnées bancaires ne sont jamais stockées par Ndjoka. Le score de fiabilité est calculé à partir de votre historique réel et expliqué facteur par facteur.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => navigate('/confidentialite')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Politique de confidentialité</button>
            <button type="button" onClick={() => navigate('/cgu')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Conditions d'utilisation</button>
            <a href="mailto:contact@ndjoka-tontine.com?subject=Exercice%20de%20mes%20droits%20RGPD" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Exercer mes droits (RGPD)</a>
          </div>
        </div>
      </div>
    </div>
  )
}
