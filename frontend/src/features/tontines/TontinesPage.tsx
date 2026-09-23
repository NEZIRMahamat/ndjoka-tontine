import { useEffect, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ChevronRight, KeyRound, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { messageOf } from '@/lib/http'
import {
  acceptInvitation,
  createTontine,
  listTontines,
  type TontinePage,
  type TontineStatus,
} from '@/features/tontines/tontines-api'

const PAGE_SIZE = 20

export default function TontinesPage() {
  const { getAccessTokenSilently } = useAuth0()
  const navigate = useNavigate()
  const [page, setPage] = useState<TontinePage | null>(null)
  const [offset, setOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState<TontineStatus | ''>('')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const result = await listTontines(token, offset, controller.signal, statusFilter || undefined)
        if (active) setPage(result)
      } catch (caught) {
        if (active) setError(messageOf(caught, 'Chargement impossible'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, offset, reload, statusFilter])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const data = new FormData(form)
    setSaving(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      const tontine = await createTontine(token, {
        name: String(data.get('name')).trim(),
        description: String(data.get('description')).trim() || null,
        currency: String(data.get('currency')).trim().toUpperCase(),
        max_members: data.get('max_members') ? Number(data.get('max_members')) : null,
      })
      form.reset()
      setOffset(0)
      setReload((value) => value + 1)
      toast.success(`« ${tontine.name} » a été créée avec votre adhésion propriétaire.`)
      navigate(`/tontines/${tontine.id}`)
    } catch (caught) {
      setError(messageOf(caught, 'Création impossible'))
    } finally {
      setSaving(false)
    }
  }

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const invitationToken = String(new FormData(form).get('token')).trim()
    setSaving(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      await acceptInvitation(token, invitationToken)
      form.reset()
      setOffset(0)
      setReload((value) => value + 1)
      toast.success('Invitation acceptée. La tontine apparaît maintenant dans votre liste.')
    } catch (caught) {
      setError(messageOf(caught, "Impossible d'accepter l'invitation"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Vos groupes</p>
        <h2 className="mt-1 text-2xl font-bold text-foreground">Mes tontines</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Créez un groupe, invitez vos proches et répartissez les responsabilités internes.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">Créer une tontine</span>
              <span className="block text-xs text-muted-foreground">Vous devenez automatiquement propriétaire</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <form onSubmit={create} className="space-y-4 border-t border-border px-5 py-4">
            <fieldset disabled={saving} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tontine-name">Nom</Label>
                <Input id="tontine-name" name="name" required minLength={3} maxLength={120} placeholder="Épargne famille" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tontine-description">Description</Label>
                <Textarea id="tontine-description" name="description" maxLength={5000} rows={3} placeholder="Objectif du groupe…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tontine-currency">Devise</Label>
                  <Input id="tontine-currency" name="currency" defaultValue="EUR" required pattern="[A-Za-z]{3}" maxLength={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tontine-max-members">Capacité max.</Label>
                  <Input id="tontine-max-members" name="max_members" type="number" min={2} step={1} placeholder="Illimitée" />
                </div>
              </div>
              <Button type="submit" className="w-full">
                Créer la tontine
              </Button>
            </fieldset>
          </form>
        </details>

        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-ai/10 text-accent-ai">
              <KeyRound className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">J’ai reçu une invitation</span>
              <span className="block text-xs text-muted-foreground">Collez le token transmis par le responsable</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <form onSubmit={accept} className="space-y-4 border-t border-border px-5 py-4">
            <fieldset disabled={saving} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invitation-token">Token d’invitation</Label>
                <Input id="invitation-token" name="token" required minLength={32} autoComplete="off" placeholder="Token confidentiel…" />
              </div>
              <Button type="submit" className="w-full">
                Rejoindre la tontine
              </Button>
            </fieldset>
          </form>
        </details>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">Adhésions accessibles</p>
              <h3 className="mt-1 text-base font-semibold text-foreground">Vos groupes</h3>
            </div>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Statut</label>
                <Select
                  value={statusFilter || 'all'}
                  onValueChange={(value) => { setStatusFilter(value === 'all' ? '' : (value as TontineStatus)); setOffset(0) }}
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="draft">Brouillons</SelectItem>
                    <SelectItem value="active">Actives</SelectItem>
                    <SelectItem value="archived">Archivées</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" disabled={loading} onClick={() => setReload((value) => value + 1)}>
                Actualiser
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : page && page.total === 0 ? (
            <EmptyState
              icon={Users}
              title="Votre première tontine vous attend"
              description="Créez-en une ou acceptez l’invitation d’un proche."
            />
          ) : page ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {page.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/tontines/${item.id}`)}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {item.name.slice(0, 2).toUpperCase()}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{item.name}</h4>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.description ?? 'Aucune description'}
                      </p>
                    </div>
                    <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        <b className="text-foreground">{item.currency}</b> Devise
                      </span>
                      <span>
                        <b className="text-foreground">{item.max_members ?? '∞'}</b> Membres max.
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  Précédent
                </Button>
                <span>
                  {page.total} tontine{page.total > 1 ? 's' : ''}
                </span>
                <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= page.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                  Suivant
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
