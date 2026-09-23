import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/app/current-user-context'
import { StatusBadge } from '@/components/shared/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  changeAdminUserRole,
  changeAdminUserStatus,
  listAdminUsers,
  type AdminUser,
  type GlobalRole,
  type UserPage,
  type UserStatus,
} from '@/features/admin/users-api'
import { messageOf } from '@/lib/http'

const globalLabels: Record<GlobalRole, string> = { user: 'Utilisateur', support: 'Support', platform_admin: 'Administrateur' }
const PAGE_SIZE = 20

export default function AdminUsersPage() {
  const profile = useCurrentUser()
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
    const controller = new AbortController()
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const result = await listAdminUsers(token, offset, status, role, controller.signal)
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
  }, [getAccessTokenSilently, offset, reload, role, status])

  async function mutate(user: AdminUser, kind: 'status' | 'role', value: string) {
    setBusyId(user.id)
    try {
      const token = await getAccessTokenSilently()
      if (kind === 'status') await changeAdminUserStatus(token, user.id, value as UserStatus)
      else await changeAdminUserRole(token, user.id, value as GlobalRole)
      setReload((current) => current + 1)
      toast.success(kind === 'status' ? 'Statut mis à jour.' : 'Rôle global mis à jour.')
    } catch (caught) {
      toast.error(messageOf(caught, 'Modification impossible'))
    } finally {
      setBusyId('')
    }
  }

  const canManage = (user: AdminUser) => profile.global_role === 'platform_admin' && user.id !== profile.id

  return (
    <div className="space-y-6">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Administration plateforme</p>
          <h2 className="mt-1 text-2xl font-bold text-foreground">Utilisateurs Ndjoka</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Consultez les profils locaux et appliquez les politiques globales, indépendamment des rôles de tontine.
          </p>
        </div>
        <Badge variant="secondary">{globalLabels[profile.global_role]}</Badge>
      </header>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Statut</label>
              <Select value={status || 'all'} onValueChange={(value) => { setStatus(value === 'all' ? '' : (value as UserStatus)); setOffset(0) }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="active">Actifs</SelectItem>
                  <SelectItem value="suspended">Suspendus</SelectItem>
                  <SelectItem value="deactivated">Désactivés</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Rôle global</label>
              <Select value={role || 'all'} onValueChange={(value) => { setRole(value === 'all' ? '' : (value as GlobalRole)); setOffset(0) }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="user">Utilisateur</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="platform_admin">Administrateur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
              Actualiser
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : page ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Rôle global</TableHead>
                      <TableHead>Inscription</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium text-foreground">{item.display_name ?? item.email ?? 'Sans nom'}</div>
                          <div className="text-xs text-muted-foreground">{item.email ?? item.auth0_sub}</div>
                        </TableCell>
                        <TableCell>
                          {canManage(item) ? (
                            <Select
                              value={item.status}
                              disabled={busyId === item.id}
                              onValueChange={(value) => void mutate(item, 'status', value)}
                            >
                              <SelectTrigger className="w-36" aria-label={`Statut de ${item.email}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Actif</SelectItem>
                                <SelectItem value="suspended">Suspendu</SelectItem>
                                <SelectItem value="deactivated">Désactivé</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <StatusBadge status={item.status} />
                          )}
                        </TableCell>
                        <TableCell>
                          {canManage(item) ? (
                            <Select
                              value={item.global_role}
                              disabled={busyId === item.id}
                              onValueChange={(value) => void mutate(item, 'role', value)}
                            >
                              <SelectTrigger className="w-40" aria-label={`Rôle de ${item.email}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">Utilisateur</SelectItem>
                                <SelectItem value="support">Support</SelectItem>
                                <SelectItem value="platform_admin">Administrateur</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            globalLabels[item.global_role]
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  Précédent
                </Button>
                <span>
                  {page.total} utilisateur{page.total > 1 ? 's' : ''}
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
