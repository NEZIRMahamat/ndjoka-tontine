import { useEffect, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { createTontine, listTontines, type Tontine, type TontinePage } from './tontines-api'
import './tontines.css'

const statusLabels = { draft: 'Brouillon', active: 'Active', archived: 'Archivée' }

export default function TontinesPage() {
  const { getAccessTokenSilently } = useAuth0()
  const [page, setPage] = useState<TontinePage | null>(null)
  const [offset, setOffset] = useState(0)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<Tontine | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const token = await getAccessTokenSilently()
        if (!active) return
        const result = await listTontines(token, offset, controller.signal)
        if (active) setPage(result)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Chargement impossible')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [getAccessTokenSilently, offset, reload])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const data = new FormData(form)
    setSaving(true)
    setSubmitError('')
    setCreated(null)
    try {
      const token = await getAccessTokenSilently()
      const tontine = await createTontine(token, {
        name: String(data.get('name')).trim(),
        description: String(data.get('description')).trim() || null,
        currency: String(data.get('currency')).trim().toUpperCase(),
        max_members: data.get('max_members') ? Number(data.get('max_members')) : null,
      })
      setCreated(tontine)
      form.reset()
      setOffset(0)
      setReload(value => value + 1)
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Création impossible')
    } finally { setSaving(false) }
  }

  return <div className="tontines-page">
    <section className="panel tontine-create" aria-labelledby="create-title">
      <h2 id="create-title">Créer une tontine</h2>
      <p>Préparez votre projet en brouillon. Les invitations et versements arriveront dans une prochaine étape.</p>
      <form onSubmit={submit}>
        <fieldset disabled={saving}>
          <label>Nom<input name="name" required minLength={3} maxLength={120} placeholder="Épargne famille" /></label>
          <label>Description (facultative)<textarea name="description" maxLength={5000} rows={3} /></label>
          <div className="tontine-form-row">
            <label>Devise ISO 4217<input name="currency" defaultValue="EUR" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" list="currency-options" /><datalist id="currency-options"><option value="EUR" /><option value="XAF" /><option value="XOF" /><option value="USD" /></datalist></label>
            <label>Nombre maximal de membres (facultatif)<input name="max_members" type="number" min={2} max={2147483647} step={1} /></label>
          </div>
          <button className="button" type="submit">{saving ? 'Création en cours…' : 'Créer ma tontine'}</button>
        </fieldset>
      </form>
      {submitError && <p role="alert" className="tontine-error">{submitError}</p>}
      {created && <p role="status">« {created.name} » a été créée en brouillon.</p>}
    </section>
    <section className="panel tontine-list" aria-labelledby="list-title" aria-busy={loading}>
      <div className="panel-heading"><h2 id="list-title">Mes tontines</h2><button className="text-button" onClick={() => setReload(value => value + 1)} disabled={loading}>Actualiser</button></div>
      {loading ? <p role="status">Chargement de vos tontines…</p> : error ? <p role="alert" className="tontine-error">{error}</p> : page && <>
        {page.total === 0 ? <p>Vous n’avez pas encore de tontine. Créez votre première tontine ci-dessus.</p> : <>
          <p>{page.total} tontine{page.total > 1 ? 's' : ''}</p>
          <ul className="owned-tontines">{page.items.map(item => <li key={item.id}>
            <div className="panel-heading"><h3>{item.name}</h3><span className="tontine-badge">{statusLabels[item.status]}</span></div>
            {item.description && <p className="tontine-description">{item.description}</p>}
            <p>{item.currency} · {item.max_members === null ? 'Sans limite de membres définie' : `${item.max_members} membres maximum`}</p>
            <small>Créée le {new Date(item.created_at).toLocaleDateString('fr-FR')}</small>
            {item.status === 'archived' && <p>Cette tontine est en lecture seule.</p>}
          </li>)}</ul>
          <div className="tontine-pagination"><button onClick={() => setOffset(Math.max(0, offset - 20))} disabled={offset === 0}>Précédent</button><span>Page {Math.floor(offset / 20) + 1}</span><button onClick={() => setOffset(offset + 20)} disabled={offset + 20 >= page.total}>Suivant</button></div>
        </>}
      </>}
    </section>
  </div>
}
