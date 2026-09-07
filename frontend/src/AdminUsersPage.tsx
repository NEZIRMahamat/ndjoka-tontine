import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import {
  changeAdminUserRole,
  changeAdminUserStatus,
  listAdminUsers,
  type AdminUser,
  type CurrentUserResponse,
  type GlobalRole,
  type UserPage,
  type UserStatus,
} from './api'

const globalLabels: Record<GlobalRole, string> = { user: 'Utilisateur', support: 'Support', platform_admin: 'Administrateur' }

export default function AdminUsersPage({ profile }: { profile: CurrentUserResponse }) {
  const { getAccessTokenSilently } = useAuth0()
  const [page, setPage] = useState<UserPage | null>(null)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<UserStatus | ''>('')
  const [role, setRole] = useState<GlobalRole | ''>('')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController(); let active = true
    void (async () => {
      setLoading(true); setError('')
      try {
        const token = await getAccessTokenSilently()
        const result = await listAdminUsers(token, offset, status, role, controller.signal)
        if (active) setPage(result)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Chargement impossible')
      } finally { if (active) setLoading(false) }
    })()
    return () => { active = false; controller.abort() }
  }, [getAccessTokenSilently, offset, reload, role, status])

  async function mutate(user: AdminUser, kind: 'status' | 'role', value: string) {
    setBusyId(user.id); setError('')
    try {
      const token = await getAccessTokenSilently()
      if (kind === 'status') await changeAdminUserStatus(token, user.id, value as UserStatus)
      else await changeAdminUserRole(token, user.id, value as GlobalRole)
      setReload((current) => current + 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Modification impossible')
    } finally { setBusyId('') }
  }

  return <div className="feature-page admin-page">
    <header className="feature-heading"><div><p className="page-kicker">Administration plateforme</p><h2>Utilisateurs Ndjoka</h2><p>Consultez les profils locaux et appliquez les politiques globales indépendamment des rôles de tontine.</p></div><span className="role-pill">{globalLabels[profile.global_role]}</span></header>
    <section className="panel admin-panel">
      <div className="filter-bar"><label>Statut<select value={status} onChange={(event) => { setStatus(event.target.value as UserStatus | ''); setOffset(0) }}><option value="">Tous</option><option value="active">Actifs</option><option value="suspended">Suspendus</option><option value="deactivated">Désactivés</option></select></label><label>Rôle global<select value={role} onChange={(event) => { setRole(event.target.value as GlobalRole | ''); setOffset(0) }}><option value="">Tous</option><option value="user">Utilisateur</option><option value="support">Support</option><option value="platform_admin">Administrateur</option></select></label><button className="secondary-button" onClick={() => setReload((value) => value + 1)}>Actualiser</button></div>
      {error && <p className="error-message" role="alert">{error}</p>}
      {loading ? <p role="status">Chargement des utilisateurs…</p> : page && <>
        <div className="table-wrap"><table><thead><tr><th>Utilisateur</th><th>Statut</th><th>Rôle global</th><th>Inscription</th></tr></thead><tbody>{page.items.map((item) => <tr key={item.id}><td><strong>{item.display_name ?? item.email ?? 'Sans nom'}</strong><small>{item.email ?? item.auth0_sub}</small></td><td>{profile.global_role === 'platform_admin' && item.id !== profile.id ? <select aria-label={`Statut de ${item.email}`} disabled={busyId === item.id} value={item.status} onChange={(event) => void mutate(item, 'status', event.target.value)}><option value="active">Actif</option><option value="suspended">Suspendu</option><option value="deactivated">Désactivé</option></select> : <span className={`state-badge ${item.status}`}>{item.status}</span>}</td><td>{profile.global_role === 'platform_admin' && item.id !== profile.id ? <select aria-label={`Rôle de ${item.email}`} disabled={busyId === item.id} value={item.global_role} onChange={(event) => void mutate(item, 'role', event.target.value)}><option value="user">Utilisateur</option><option value="support">Support</option><option value="platform_admin">Administrateur</option></select> : globalLabels[item.global_role]}</td><td>{new Date(item.created_at).toLocaleDateString('fr-FR')}</td></tr>)}</tbody></table></div>
        <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Précédent</button><span>{page.total} utilisateur{page.total > 1 ? 's' : ''}</span><button disabled={offset + 20 >= page.total} onClick={() => setOffset(offset + 20)}>Suivant</button></div>
      </>}
    </section>
  </div>
}
