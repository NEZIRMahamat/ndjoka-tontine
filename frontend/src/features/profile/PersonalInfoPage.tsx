import { useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useCurrentUser, useCurrentUserState } from '@/app/current-user-context'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { BackLink } from '@/components/shared/page-primitives'
import { deactivateCurrentUser, updateCurrentUser } from '@/features/profile/profile-api'
import { messageOf } from '@/lib/http'

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition-all focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400'

export default function PersonalInfoPage() {
  const navigate = useNavigate()
  const profile = useCurrentUser()
  const { setProfile } = useCurrentUserState()
  const { user, getAccessTokenSilently, logout } = useAuth0()
  const confirm = useConfirm()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    displayName: profile.display_name ?? user?.name ?? '',
    phone: profile.phone ?? '',
    address: profile.address ?? '',
    city: profile.city ?? '',
    avatarUrl: profile.avatar_url ?? '',
  })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const token = await getAccessTokenSilently()
      const updated = await updateCurrentUser(token, {
        display_name: form.displayName.trim() || undefined,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        avatar_url: form.avatarUrl.trim() || null,
      })
      setProfile(updated)
      toast.success('Informations mises à jour')
    } catch (caught) {
      toast.error(messageOf(caught, 'Enregistrement impossible.'))
    } finally {
      setSaving(false)
    }
  }

  async function deactivate() {
    const ok = await confirm({
      title: 'Désactiver votre compte ?',
      description: "Votre compte sera désactivé et vous serez déconnecté. Vos engagements dans les tontines en cours restent dus. Contactez le support pour toute demande d'effacement (RGPD).",
      confirmLabel: 'Désactiver',
      destructive: true,
    })
    if (!ok) return
    try {
      const token = await getAccessTokenSilently()
      await deactivateCurrentUser(token)
      toast.success('Compte désactivé.')
      void logout({ logoutParams: { returnTo: window.location.origin } })
    } catch (caught) {
      toast.error(messageOf(caught, 'Désactivation impossible.'))
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <BackLink to="/profile" label="Mon Profil" />
      <form onSubmit={submit} className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
          <h2 className="font-bold text-slate-800">Informations personnelles</h2>
          <p className="mt-0.5 text-xs text-slate-400">Ces informations sont utilisées pour votre compte et affichées aux membres de vos tontines (nom uniquement)</p>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-slate-500 uppercase">Nom affiché</label>
            <input className={inputCls} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} maxLength={120} required minLength={2} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-slate-500 uppercase">E-mail</label>
            <input className={inputCls} value={profile.email ?? user?.email ?? ''} disabled />
            <p className="mt-1 text-xs text-slate-400">L'adresse e-mail est gérée par votre fournisseur de connexion.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold tracking-wider text-slate-500 uppercase">Téléphone</label>
              <input type="tel" className={inputCls} placeholder="+33 6 12 34 56 78" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={32} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold tracking-wider text-slate-500 uppercase">Ville</label>
              <input className={inputCls} placeholder="Paris" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} maxLength={120} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-slate-500 uppercase">Adresse</label>
            <input className={inputCls} placeholder="15 rue de la Paix, 75001 Paris" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={255} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-slate-500 uppercase">Photo de profil (URL)</label>
            <input type="url" className={inputCls} placeholder="https://…" value={form.avatarUrl} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} maxLength={2048} />
          </div>
        </div>
        <div className="px-5 pb-5">
          <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer les modifications
          </button>
        </div>
      </form>

      <div className="flex items-center gap-4 rounded-xl border border-red-100 bg-white p-5 shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500"><Trash2 size={18} /></div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-700">Désactiver mon compte</p>
          <p className="text-xs text-slate-400">Vous pouvez demander la suppression de vos données selon la <button type="button" onClick={() => navigate('/confidentialite')} className="underline">politique de confidentialité</button>.</p>
        </div>
        <button type="button" onClick={() => void deactivate()} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Désactiver</button>
      </div>
    </div>
  )
}
