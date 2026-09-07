import { useEffect, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import type { CurrentUserResponse } from './api'
import {
  acceptInvitation,
  archiveTontine,
  changeMemberRole,
  createInvitation,
  createTontine,
  leaveTontine,
  listInvitations,
  listMembers,
  listTontines,
  removeMember,
  revokeInvitation,
  transferOwnership,
  updateTontine,
  type CreatedInvitation,
  type InvitationPage,
  type MembershipPage,
  type MembershipRole,
  type Tontine,
  type TontinePage,
  type TontineStatus,
} from './tontines-api'
import './tontines.css'

const statusLabels = { draft: 'Brouillon', active: 'Active', archived: 'Archivée' }
const roleLabels: Record<MembershipRole, string> = {
  owner: 'Propriétaire', manager: 'Gestionnaire', treasurer: 'Trésorier', member: 'Membre',
}

function messageOf(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback
}

export default function TontinesPage({ profile }: { profile: CurrentUserResponse }) {
  const { getAccessTokenSilently } = useAuth0()
  const [page, setPage] = useState<TontinePage | null>(null)
  const [selected, setSelected] = useState<Tontine | null>(null)
  const [offset, setOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState<TontineStatus | ''>('')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController(); let active = true
    void (async () => {
      setLoading(true); setError('')
      try {
        const token = await getAccessTokenSilently()
        const result = await listTontines(token, offset, controller.signal, statusFilter || undefined)
        if (active) setPage(result)
      } catch (caught) {
        if (active) setError(messageOf(caught, 'Chargement impossible'))
      } finally { if (active) setLoading(false) }
    })()
    return () => { active = false; controller.abort() }
  }, [getAccessTokenSilently, offset, reload, statusFilter])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return
    const form = event.currentTarget; const data = new FormData(form)
    setSaving(true); setError(''); setNotice('')
    try {
      const token = await getAccessTokenSilently()
      const tontine = await createTontine(token, {
        name: String(data.get('name')).trim(),
        description: String(data.get('description')).trim() || null,
        currency: String(data.get('currency')).trim().toUpperCase(),
        max_members: data.get('max_members') ? Number(data.get('max_members')) : null,
      })
      form.reset(); setOffset(0); setSelected(tontine)
      setNotice(`« ${tontine.name} » a été créée avec votre adhésion propriétaire.`)
      setReload((value) => value + 1)
    } catch (caught) { setError(messageOf(caught, 'Création impossible')) }
    finally { setSaving(false) }
  }

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const invitationToken = String(new FormData(form).get('token')).trim()
    setSaving(true); setError(''); setNotice('')
    try {
      const token = await getAccessTokenSilently()
      await acceptInvitation(token, invitationToken)
      form.reset(); setOffset(0); setReload((value) => value + 1)
      setNotice('Invitation acceptée. La tontine apparaît maintenant dans votre liste.')
    } catch (caught) { setError(messageOf(caught, "Impossible d'accepter l'invitation")) }
    finally { setSaving(false) }
  }

  function updateSelected(tontine?: Tontine) {
    if (tontine) setSelected(tontine)
    else setSelected(null)
    setReload((value) => value + 1)
  }

  return <div className="feature-page tontines-page">
    <header className="feature-heading"><div><p className="page-kicker">Sprints Tontines & Membres</p><h2>Mes tontines</h2><p>Créez un groupe, invitez vos proches et répartissez les responsabilités internes.</p></div><span className="release-pill">API v0.4.0</span></header>
    {(error || notice) && <div className={error ? 'flash error-message' : 'flash success-message'} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <section className="quick-actions">
      <details className="panel action-card"><summary><span className="action-icon">＋</span><span><strong>Créer une tontine</strong><small>Vous devenez automatiquement propriétaire</small></span></summary><form onSubmit={create}><fieldset disabled={saving} className="form-stack"><label>Nom<input name="name" required minLength={3} maxLength={120} placeholder="Épargne famille" /></label><label>Description<textarea name="description" maxLength={5000} rows={3} placeholder="Objectif du groupe…" /></label><div className="form-row"><label>Devise<input name="currency" defaultValue="EUR" required pattern="[A-Za-z]{3}" maxLength={3} /></label><label>Capacité maximale<input name="max_members" type="number" min={2} step={1} placeholder="Illimitée" /></label></div><button className="button" type="submit">Créer la tontine</button></fieldset></form></details>
      <details className="panel action-card"><summary><span className="action-icon token">⌁</span><span><strong>J’ai reçu une invitation</strong><small>Collez le token transmis par le responsable</small></span></summary><form onSubmit={accept}><fieldset disabled={saving} className="form-stack"><label>Token d’invitation<input name="token" required minLength={32} autoComplete="off" placeholder="Token confidentiel…" /></label><button className="button" type="submit">Rejoindre la tontine</button></fieldset></form></details>
    </section>
    <section className="panel tontine-list" aria-busy={loading}>
      <div className="panel-heading"><div><p className="page-kicker">Adhésions accessibles</p><h3>Vos groupes</h3></div><div className="list-actions"><label className="inline-filter">Statut<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as TontineStatus | ''); setOffset(0) }}><option value="">Tous</option><option value="draft">Brouillons</option><option value="active">Actives</option><option value="archived">Archivées</option></select></label><button className="secondary-button" onClick={() => setReload((value) => value + 1)} disabled={loading}>Actualiser</button></div></div>
      {loading ? <p role="status">Chargement de vos tontines…</p> : page && page.total === 0 ? <div className="empty-state"><span>◎</span><h3>Votre première tontine vous attend</h3><p>Créez-en une ou acceptez l’invitation d’un proche.</p></div> : page && <><div className="tontine-cards">{page.items.map((item) => <article className={`tontine-card ${selected?.id === item.id ? 'selected' : ''}`} key={item.id}><div className="tontine-card-head"><span className="tontine-monogram">{item.name.slice(0, 2).toUpperCase()}</span><span className={`state-badge ${item.status}`}>{statusLabels[item.status]}</span></div><h3>{item.name}</h3><p>{item.description ?? 'Aucune description'}</p><div className="tontine-meta"><span><b>{item.currency}</b> Devise</span><span><b>{item.max_members ?? '∞'}</b> Membres max.</span></div><button className="card-link" onClick={() => setSelected(item)}>Gérer cette tontine <span>→</span></button></article>)}</div><div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Précédent</button><span>{page.total} tontine{page.total > 1 ? 's' : ''}</span><button disabled={offset + 20 >= page.total} onClick={() => setOffset(offset + 20)}>Suivant</button></div></>}
    </section>
    {selected && <TontineWorkspace key={selected.id} tontine={selected} profile={profile} onClose={() => setSelected(null)} onChanged={updateSelected} />}
  </div>
}

function TontineWorkspace({ tontine, profile, onClose, onChanged }: { tontine: Tontine; profile: CurrentUserResponse; onClose: () => void; onChanged: (item?: Tontine) => void }) {
  const { getAccessTokenSilently } = useAuth0()
  const [members, setMembers] = useState<MembershipPage | null>(null)
  const [invitations, setInvitations] = useState<InvitationPage | null>(null)
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const myMembership = members?.items.find((item) => item.user_id === profile.id && item.status === 'active')
  const canInvite = myMembership?.role === 'owner' || myMembership?.role === 'manager'
  const isOwner = myMembership?.role === 'owner'
  const writable = tontine.status !== 'archived'

  useEffect(() => {
    const controller = new AbortController(); let active = true
    void (async () => {
      setLoading(true); setError('')
      try {
        const token = await getAccessTokenSilently()
        const memberPage = await listMembers(token, tontine.id, controller.signal)
        if (!active) return
        setMembers(memberPage)
        const role = memberPage.items.find((item) => item.user_id === profile.id && item.status === 'active')?.role
        if (role === 'owner' || role === 'manager') {
          setInvitations(await listInvitations(token, tontine.id, controller.signal))
        } else setInvitations(null)
      } catch (caught) { if (active) setError(messageOf(caught, 'Chargement impossible')) }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false; controller.abort() }
  }, [getAccessTokenSilently, profile.id, reload, tontine.id])

  async function action(work: (token: string) => Promise<unknown>, success: string, close = false) {
    setBusy(true); setError(''); setNotice('')
    try {
      const token = await getAccessTokenSilently(); await work(token)
      setNotice(success); setReload((value) => value + 1)
      if (close) onChanged()
    } catch (caught) { setError(messageOf(caught, 'Action impossible')) }
    finally { setBusy(false) }
  }

  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    setBusy(true); setError(''); setNotice('')
    try {
      const token = await getAccessTokenSilently()
      const updated = await updateTontine(token, tontine.id, {
        name: String(data.get('name')).trim(), description: String(data.get('description')).trim() || null,
        ...(tontine.status === 'draft' ? { currency: String(data.get('currency')).trim().toUpperCase() } : {}),
        max_members: data.get('max_members') ? Number(data.get('max_members')) : null,
      })
      setNotice('Informations de la tontine mises à jour.'); onChanged(updated)
    } catch (caught) { setError(messageOf(caught, 'Modification impossible')) }
    finally { setBusy(false) }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
    setBusy(true); setError(''); setCreatedInvitation(null)
    try {
      const token = await getAccessTokenSilently()
      const invitation = await createInvitation(token, tontine.id, String(data.get('email')), String(data.get('role')) as Exclude<MembershipRole, 'owner'>)
      setCreatedInvitation(invitation); form.reset(); setReload((value) => value + 1)
      setNotice('Invitation créée. Copiez le token maintenant : il ne sera plus affiché ensuite.')
    } catch (caught) { setError(messageOf(caught, 'Invitation impossible')) }
    finally { setBusy(false) }
  }

  async function archive() {
    setBusy(true); setError(''); setNotice('')
    try {
      const token = await getAccessTokenSilently()
      const archived = await archiveTontine(token, tontine.id)
      setNotice('La tontine est archivée et passe en lecture seule.')
      onChanged(archived)
    } catch (caught) { setError(messageOf(caught, 'Archivage impossible')) }
    finally { setBusy(false) }
  }

  return <section className="workspace panel" aria-busy={loading}>
    <header className="workspace-head"><div><button className="back-button" onClick={onClose}>← Retour aux groupes</button><p className="page-kicker">Espace de gestion</p><h2>{tontine.name}</h2><p>{tontine.description ?? 'Aucune description renseignée.'}</p></div><div className="workspace-status"><span className={`state-badge ${tontine.status}`}>{statusLabels[tontine.status]}</span>{myMembership && <span className="role-pill">{roleLabels[myMembership.role]}</span>}</div></header>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}
    {loading ? <p>Chargement de l’espace membre…</p> : <div className="workspace-grid">
      <div className="workspace-main">
        <section className="workspace-section"><div className="section-title"><div><p className="page-kicker">Équipe</p><h3>Membres de la tontine</h3></div><span>{members?.items.filter((item) => item.status === 'active').length ?? 0} actif(s)</span></div><div className="member-list">{members?.items.map((member) => <article className={`member-row ${member.status !== 'active' ? 'muted' : ''}`} key={member.id}><span className="member-avatar">{member.user_id === profile.id ? (profile.display_name ?? profile.email ?? 'VO').slice(0, 2).toUpperCase() : 'MB'}</span><div><strong>{member.user_id === profile.id ? 'Vous' : `Membre ${member.user_id.slice(0, 8)}`}</strong><small>{roleLabels[member.role]} · {member.status}</small></div>{isOwner && member.role !== 'owner' && member.status === 'active' ? <div className="member-actions"><select aria-label="Modifier le rôle" value={member.role} disabled={busy} onChange={(event) => void action((token) => changeMemberRole(token, tontine.id, member.user_id, event.target.value as Exclude<MembershipRole, 'owner'>), 'Rôle mis à jour.')}><option value="manager">Gestionnaire</option><option value="treasurer">Trésorier</option><option value="member">Membre</option></select><button className="icon-danger" title="Retirer" disabled={busy} onClick={() => window.confirm('Retirer ce membre ?') && void action((token) => removeMember(token, tontine.id, member.user_id), 'Le membre a été retiré.')}>×</button><button className="mini-button" disabled={busy} onClick={() => window.confirm('Transférer définitivement la propriété ?') && void action((token) => transferOwnership(token, tontine.id, member.user_id), 'La propriété a été transférée.')}>Transférer</button></div> : null}</article>)}</div></section>
        {canInvite && <section className="workspace-section"><div className="section-title"><div><p className="page-kicker">Accès</p><h3>Invitations</h3></div></div>{writable && <form className="inline-invite" onSubmit={invite}><input name="email" type="email" required placeholder="personne@exemple.com" /><select name="role" defaultValue="member"><option value="member">Membre</option>{isOwner && <><option value="manager">Gestionnaire</option><option value="treasurer">Trésorier</option></>}</select><button className="button" disabled={busy}>Inviter</button></form>}{createdInvitation && <div className="token-box"><div><strong>Token à transmettre</strong><code>{createdInvitation.token}</code></div><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(createdInvitation.token)}>Copier</button></div>}<div className="invitation-list">{invitations?.items.length === 0 && <p>Aucune invitation créée.</p>}{invitations?.items.map((invitation) => <article key={invitation.id}><div><strong>{invitation.email}</strong><small>{roleLabels[invitation.role]} · expire le {new Date(invitation.expires_at).toLocaleDateString('fr-FR')}</small></div><span className={`state-badge ${invitation.status}`}>{invitation.status}</span>{invitation.status === 'pending' && writable && <button className="text-danger" disabled={busy} onClick={() => void action((token) => revokeInvitation(token, tontine.id, invitation.id), 'Invitation révoquée.')}>Révoquer</button>}</article>)}</div></section>}
      </div>
      <aside className="workspace-side">
        <section className="workspace-section summary-box"><p className="page-kicker">Paramètres</p><dl><div><dt>Devise</dt><dd>{tontine.currency}</dd></div><div><dt>Capacité</dt><dd>{tontine.max_members ?? 'Illimitée'}</dd></div><div><dt>Création</dt><dd>{new Date(tontine.created_at).toLocaleDateString('fr-FR')}</dd></div></dl></section>
        {isOwner && writable && <details className="workspace-section edit-box"><summary>Modifier la tontine</summary><form onSubmit={edit}><fieldset className="form-stack" disabled={busy}><label>Nom<input name="name" defaultValue={tontine.name} required minLength={3} /></label><label>Description<textarea name="description" defaultValue={tontine.description ?? ''} rows={3} /></label><label>Devise {tontine.status === 'active' && <small>Immuable après activation</small>}<input name="currency" defaultValue={tontine.currency} required maxLength={3} disabled={tontine.status === 'active'} /></label><label>Capacité<input name="max_members" type="number" min={2} defaultValue={tontine.max_members ?? ''} /></label><button className="button">Enregistrer</button></fieldset></form></details>}
        {myMembership && myMembership.role !== 'owner' && writable && <button className="secondary-button full-button" disabled={busy} onClick={() => window.confirm('Quitter cette tontine ?') && void action((token) => leaveTontine(token, tontine.id), 'Vous avez quitté la tontine.', true)}>Quitter la tontine</button>}
        {isOwner && writable && <button className="danger-button full-button" disabled={busy} onClick={() => window.confirm('Archiver cette tontine ? Elle deviendra accessible en lecture seule.') && void archive()}>Archiver la tontine</button>}
      </aside>
    </div>}
  </section>
}
