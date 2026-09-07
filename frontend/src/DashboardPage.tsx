import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import type { CurrentUserResponse } from './api'
import { listTontines, type TontinePage } from './tontines-api'

export default function DashboardPage({ profile, onOpenTontines }: { profile: CurrentUserResponse; onOpenTontines: () => void }) {
  const { getAccessTokenSilently } = useAuth0()
  const [page, setPage] = useState<TontinePage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController(); let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const result = await listTontines(token, 0, controller.signal)
        if (active) setPage(result)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Chargement impossible')
      }
    })()
    return () => { active = false; controller.abort() }
  }, [getAccessTokenSilently])

  const active = page?.items.filter((item) => item.status === 'active').length ?? 0
  const draft = page?.items.filter((item) => item.status === 'draft').length ?? 0
  const archived = page?.items.filter((item) => item.status === 'archived').length ?? 0
  const name = profile.display_name?.split(' ')[0] ?? profile.email?.split('@')[0] ?? 'membre'

  return <div className="dashboard">
    <div className="welcome-row"><div><p className="page-kicker">Vue d’ensemble</p><h2>Bonjour, {name} <span aria-hidden="true">👋</span></h2><p>Votre espace reflète les données réelles de l’API Ndjoka.</p></div><button className="button" onClick={onOpenTontines}>＋ Nouvelle tontine</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <section className="stats-grid"><article className="stat-card"><div><p>Tontines accessibles</p><strong>{page?.total ?? '—'}</strong><small>Comme propriétaire ou membre actif</small></div><span className="stat-icon blue">◎</span></article><article className="stat-card"><div><p>Groupes actifs</p><strong>{active}</strong><small className="positive">{draft} brouillon{draft > 1 ? 's' : ''} à préparer</small></div><span className="stat-icon green">↗</span></article><article className="stat-card"><div><p>Archives</p><strong>{archived}</strong><small>Conservées en lecture seule</small></div><span className="stat-icon purple">◇</span></article></section>
    <div className="content-grid"><section className="panel activity-panel"><div className="panel-heading"><div><p className="page-kicker">Derniers groupes</p><h3>Vos tontines</h3></div><button className="text-button" onClick={onOpenTontines}>Tout gérer →</button></div>{!page ? <p>Chargement…</p> : page.items.length === 0 ? <div className="empty-state compact"><p>Créez votre première tontine pour commencer.</p></div> : <div className="dashboard-list">{page.items.slice(0, 4).map((item) => <article key={item.id}><span className="tontine-monogram">{item.name.slice(0, 2).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.currency} · {item.max_members ?? '∞'} membres</small></div><span className={`state-badge ${item.status}`}>{item.status}</span></article>)}</div>}</section><section className="panel architecture-panel"><p className="page-kicker">Architecture live</p><h3>Un parcours de bout en bout</h3><div className="architecture-flow"><span>React <small>Vercel</small></span><b>→</b><span>Auth0 <small>Identité</small></span><b>→</b><span>FastAPI <small>Render</small></span><b>→</b><span>PostgreSQL <small>Données</small></span></div><p>Le token Auth0 protège chaque appel. Les rôles globaux et les rôles internes restent séparés.</p><div className="profile-facts"><span><b>{profile.status}</b> Compte</span><span><b>{profile.global_role.replace('_', ' ')}</b> Rôle global</span><span><b>v0.4.0</b> API</span></div></section></div>
  </div>
}
