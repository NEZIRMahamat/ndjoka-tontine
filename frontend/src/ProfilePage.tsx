import { useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import {
  deactivateCurrentUser,
  updateCurrentUser,
  type CurrentUserResponse,
} from './api'

export default function ProfilePage({
  profile,
  onUpdated,
}: {
  profile: CurrentUserResponse
  onUpdated: (profile: CurrentUserResponse) => void
}) {
  const { getAccessTokenSilently, logout } = useAuth0()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true); setError(''); setMessage('')
    try {
      const token = await getAccessTokenSilently()
      const updated = await updateCurrentUser(token, {
        display_name: String(data.get('display_name')).trim(),
        avatar_url: String(data.get('avatar_url')).trim() || null,
        locale: String(data.get('locale')).trim(),
        timezone: String(data.get('timezone')).trim(),
      })
      onUpdated(updated)
      setMessage('Votre profil a été mis à jour.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mise à jour impossible')
    } finally { setSaving(false) }
  }

  async function deactivate() {
    if (!window.confirm('Désactiver votre compte Ndjoka ? Cette action bloque immédiatement les routes métier.')) return
    setSaving(true); setError('')
    try {
      const token = await getAccessTokenSilently()
      await deactivateCurrentUser(token)
      void logout({ logoutParams: { returnTo: window.location.origin } })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Désactivation impossible')
      setSaving(false)
    }
  }

  return <div className="feature-page profile-page">
    <header className="feature-heading"><div><p className="page-kicker">Sprint Utilisateurs</p><h2>Mon profil Ndjoka</h2><p>Vos préférences métier sont enregistrées dans PostgreSQL. Auth0 conserve votre identité de connexion.</p></div><span className="role-pill">{profile.global_role.replace('_', ' ')}</span></header>
    <div className="profile-grid">
      <section className="panel profile-summary">
        {profile.avatar_url
          ? <img src={profile.avatar_url} alt="" />
          : <span className="profile-avatar-fallback" aria-hidden="true">{(profile.display_name ?? profile.email ?? 'ND').slice(0, 2).toUpperCase()}</span>}
        <h3>{profile.display_name ?? profile.email ?? 'Membre Ndjoka'}</h3>
        <p>{profile.email ?? 'E-mail non exposé par le token'}</p>
        <dl><div><dt>Statut</dt><dd><span className="status-dot" />{profile.status}</dd></div><div><dt>Compte créé</dt><dd>{new Date(profile.created_at).toLocaleDateString('fr-FR')}</dd></div><div><dt>Identifiant</dt><dd><code>{profile.id.slice(0, 8)}…</code></dd></div></dl>
      </section>
      <section className="panel form-panel">
        <div className="panel-heading"><div><p className="page-kicker">Préférences</p><h3>Informations personnelles</h3></div></div>
        <form onSubmit={submit}><fieldset disabled={saving} className="form-stack">
          <label>Nom affiché<input name="display_name" defaultValue={profile.display_name ?? ''} required maxLength={120} /></label>
          <label>URL de l’avatar <small>(facultative)</small><input name="avatar_url" type="url" defaultValue={profile.avatar_url ?? ''} placeholder="https://…" /></label>
          <div className="form-row"><label>Langue<input name="locale" defaultValue={profile.locale} required /></label><label>Fuseau horaire<input name="timezone" defaultValue={profile.timezone} required /></label></div>
          <button className="button" type="submit">{saving ? 'Enregistrement…' : 'Enregistrer le profil'}</button>
        </fieldset></form>
        {message && <p className="success-message" role="status">{message}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
    </div>
    <section className="panel danger-zone"><div><h3>Zone sensible</h3><p>La désactivation est logique : vos données sont conservées, mais l’accès métier est bloqué.</p></div><button className="danger-button" disabled={saving} onClick={deactivate}>Désactiver mon compte</button></section>
  </div>
}
