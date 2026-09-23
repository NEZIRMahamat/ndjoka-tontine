import { useEffect, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowLeft, CalendarClock, Copy, UserMinus } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { messageOf } from '@/lib/http'
import {
  archiveTontine,
  changeMemberRole,
  createInvitation,
  getTontine,
  leaveTontine,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
  transferOwnership,
  updateTontine,
  type CreatedInvitation,
  type InvitationPage,
  type MembershipPage,
  type MembershipRole,
  type Tontine,
} from '@/features/tontines/tontines-api'

const roleLabels: Record<MembershipRole, string> = {
  owner: 'Propriétaire',
  manager: 'Gestionnaire',
  treasurer: 'Trésorier',
  member: 'Membre',
}

export default function TontineWorkspace() {
  const { tontineId } = useParams<{ tontineId: string }>()
  const navigate = useNavigate()
  const profile = useCurrentUser()
  const { getAccessTokenSilently } = useAuth0()
  const confirm = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'overview'

  const [tontine, setTontine] = useState<Tontine | null>(null)
  const [members, setMembers] = useState<MembershipPage | null>(null)
  const [invitations, setInvitations] = useState<InvitationPage | null>(null)
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [inviteRole, setInviteRole] = useState<Exclude<MembershipRole, 'owner'>>('member')

  useEffect(() => {
    if (!tontineId) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      setLoading(true)
      setLoadError('')
      try {
        const token = await getAccessTokenSilently()
        const [tontineResult, memberPage] = await Promise.all([
          getTontine(token, tontineId, controller.signal),
          listMembers(token, tontineId, controller.signal),
        ])
        if (!active) return
        setTontine(tontineResult)
        setMembers(memberPage)
        const role = memberPage.items.find((item) => item.user_id === profile.id && item.status === 'active')?.role
        if (role === 'owner' || role === 'manager') {
          setInvitations(await listInvitations(token, tontineId, controller.signal))
        } else {
          setInvitations(null)
        }
      } catch (caught) {
        if (active) setLoadError(messageOf(caught, 'Chargement impossible'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [tontineId, reload, getAccessTokenSilently, profile.id])

  async function action(work: (token: string) => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      const token = await getAccessTokenSilently()
      await work(token)
      toast.success(success)
      setReload((value) => value + 1)
    } catch (caught) {
      toast.error(messageOf(caught, 'Action impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!tontineId) return
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const token = await getAccessTokenSilently()
      const updated = await updateTontine(token, tontineId, {
        name: String(data.get('name')).trim(),
        description: String(data.get('description')).trim() || null,
        ...(tontine?.status === 'draft' ? { currency: String(data.get('currency')).trim().toUpperCase() } : {}),
        max_members: data.get('max_members') ? Number(data.get('max_members')) : null,
      })
      setTontine(updated)
      toast.success('Informations de la tontine mises à jour.')
    } catch (caught) {
      toast.error(messageOf(caught, 'Modification impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!tontineId) return
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setCreatedInvitation(null)
    try {
      const token = await getAccessTokenSilently()
      const invitation = await createInvitation(
        token,
        tontineId,
        String(data.get('email')),
        inviteRole,
      )
      setCreatedInvitation(invitation)
      form.reset()
      setInviteRole('member')
      setReload((value) => value + 1)
      toast.success('Invitation créée. Copiez le token maintenant : il ne sera plus affiché ensuite.')
    } catch (caught) {
      toast.error(messageOf(caught, 'Invitation impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function archive() {
    if (!tontineId) return
    const confirmed = await confirm({
      title: 'Archiver cette tontine ?',
      description: 'Elle deviendra accessible en lecture seule pour tous les membres.',
      confirmLabel: 'Archiver',
      destructive: true,
    })
    if (!confirmed) return
    setBusy(true)
    try {
      const token = await getAccessTokenSilently()
      const archived = await archiveTontine(token, tontineId)
      setTontine(archived)
      toast.success('La tontine est archivée et passe en lecture seule.')
    } catch (caught) {
      toast.error(messageOf(caught, 'Archivage impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    if (!tontineId) return
    const confirmed = await confirm({ title: 'Quitter cette tontine ?', destructive: true, confirmLabel: 'Quitter' })
    if (!confirmed) return
    setBusy(true)
    try {
      const token = await getAccessTokenSilently()
      await leaveTontine(token, tontineId)
      toast.success('Vous avez quitté la tontine.')
      navigate('/tontines')
    } catch (caught) {
      toast.error(messageOf(caught, 'Action impossible'))
      setBusy(false)
    }
  }

  async function removeOneMember(userId: string) {
    if (!tontineId) return
    const confirmed = await confirm({ title: 'Retirer ce membre ?', destructive: true, confirmLabel: 'Retirer' })
    if (confirmed) void action((token) => removeMember(token, tontineId, userId), 'Le membre a été retiré.')
  }

  async function transferTo(userId: string) {
    if (!tontineId) return
    const confirmed = await confirm({
      title: 'Transférer la propriété ?',
      description: 'Cette action est définitive : vous perdrez le rôle de propriétaire.',
      confirmLabel: 'Transférer',
      destructive: true,
    })
    if (confirmed) void action((token) => transferOwnership(token, tontineId, userId), 'La propriété a été transférée.')
  }

  async function revoke(invitationId: string) {
    if (!tontineId) return
    void action((token) => revokeInvitation(token, tontineId, invitationId), 'Invitation révoquée.')
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate('/tontines')} />
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      </div>
    )
  }

  if (loading || !tontine || !members) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate('/tontines')} />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const myMembership = members.items.find((item) => item.user_id === profile.id && item.status === 'active')
  const canInvite = myMembership?.role === 'owner' || myMembership?.role === 'manager'
  const isOwner = myMembership?.role === 'owner'
  const writable = tontine.status !== 'archived'
  const activeMembersCount = members.items.filter((item) => item.status === 'active').length

  return (
    <div className="space-y-6">
      <BackLink onClick={() => navigate('/tontines')} />

      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Espace de gestion</p>
          <h2 className="mt-1 text-2xl font-bold text-foreground">{tontine.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tontine.description ?? 'Aucune description renseignée.'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={tontine.status} />
          {myMembership ? <Badge variant="secondary">{roleLabels[myMembership.role]}</Badge> : null}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setSearchParams(value === 'overview' ? {} : { tab: value })}>
        <TabsList>
          <TabsTrigger value="overview">Vue d’ensemble</TabsTrigger>
          <TabsTrigger value="members">Membres</TabsTrigger>
          {canInvite ? <TabsTrigger value="invitations">Invitations</TabsTrigger> : null}
          <TabsTrigger value="cycles">Cycles</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paramètres</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 sm:grid-cols-3">
                  <SummaryItem label="Devise" value={tontine.currency} />
                  <SummaryItem label="Capacité" value={tontine.max_members ? String(tontine.max_members) : 'Illimitée'} />
                  <SummaryItem label="Création" value={new Date(tontine.created_at).toLocaleDateString('fr-FR')} />
                </dl>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {isOwner && writable ? (
                <details className="group rounded-xl border border-border bg-card">
                  <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-foreground">
                    Modifier la tontine
                  </summary>
                  <form onSubmit={edit} className="space-y-3 border-t border-border px-5 py-4">
                    <fieldset disabled={busy} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-name">Nom</Label>
                        <Input id="edit-name" name="name" defaultValue={tontine.name} required minLength={3} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-description">Description</Label>
                        <Textarea id="edit-description" name="description" defaultValue={tontine.description ?? ''} rows={3} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-currency">
                          Devise {tontine.status === 'active' ? <span className="text-muted-foreground">(immuable après activation)</span> : null}
                        </Label>
                        <Input id="edit-currency" name="currency" defaultValue={tontine.currency} required maxLength={3} disabled={tontine.status === 'active'} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-max-members">Capacité</Label>
                        <Input id="edit-max-members" name="max_members" type="number" min={2} defaultValue={tontine.max_members ?? ''} />
                      </div>
                      <Button type="submit" size="sm">
                        Enregistrer
                      </Button>
                    </fieldset>
                  </form>
                </details>
              ) : null}

              {myMembership && myMembership.role !== 'owner' && writable ? (
                <Button variant="outline" className="w-full" disabled={busy} onClick={leave}>
                  Quitter la tontine
                </Button>
              ) : null}
              {isOwner && writable ? (
                <Button
                  variant="outline"
                  className="w-full border-destructive text-destructive hover:bg-destructive/10"
                  disabled={busy}
                  onClick={archive}
                >
                  Archiver la tontine
                </Button>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Membres de la tontine</CardTitle>
              <span className="text-sm text-muted-foreground">{activeMembersCount} actif(s)</span>
            </CardHeader>
            <CardContent className="space-y-1">
              {members.items.map((member) => (
                <div
                  key={member.id}
                  className={`flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0 ${member.status !== 'active' ? 'opacity-50' : ''}`}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>
                      {member.user_id === profile.id ? (profile.display_name ?? profile.email ?? 'VO').slice(0, 2).toUpperCase() : 'MB'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {member.user_id === profile.id ? 'Vous' : `Membre ${member.user_id.slice(0, 8)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {roleLabels[member.role]} · {member.status}
                    </p>
                  </div>
                  {isOwner && member.role !== 'owner' && member.status === 'active' ? (
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role}
                        disabled={busy}
                        onValueChange={(value) => void action(
                          (token) => changeMemberRole(token, tontineId!, member.user_id, value as Exclude<MembershipRole, 'owner'>),
                          'Rôle mis à jour.',
                        )}
                      >
                        <SelectTrigger className="w-40" aria-label="Modifier le rôle"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manager">Gestionnaire</SelectItem>
                          <SelectItem value="treasurer">Trésorier</SelectItem>
                          <SelectItem value="member">Membre</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => void transferTo(member.user_id)} disabled={busy}>
                        Transférer
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void removeOneMember(member.user_id)} disabled={busy} aria-label="Retirer">
                        <UserMinus className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {canInvite ? (
          <TabsContent value="invitations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Invitations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {writable ? (
                  <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[220px] flex-1 space-y-1.5">
                      <Label htmlFor="invite-email">E-mail</Label>
                      <Input id="invite-email" name="email" type="email" required placeholder="personne@exemple.com" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-role">Rôle</Label>
                      <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as Exclude<MembershipRole, 'owner'>)}>
                        <SelectTrigger id="invite-role" className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Membre</SelectItem>
                          {isOwner ? (
                            <>
                              <SelectItem value="manager">Gestionnaire</SelectItem>
                              <SelectItem value="treasurer">Trésorier</SelectItem>
                            </>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" disabled={busy}>
                      Inviter
                    </Button>
                  </form>
                ) : null}

                {createdInvitation ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">Token à transmettre</p>
                      <code className="block truncate text-xs text-muted-foreground">{createdInvitation.token}</code>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(createdInvitation.token)
                        toast.success('Token copié.')
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copier
                    </Button>
                  </div>
                ) : null}

                <div className="divide-y divide-border">
                  {invitations?.items.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">Aucune invitation créée.</p>
                  ) : null}
                  {invitations?.items.map((invitation) => (
                    <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{invitation.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabels[invitation.role]} · expire le {new Date(invitation.expires_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={invitation.status} />
                        {invitation.status === 'pending' && writable ? (
                          <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => void revoke(invitation.id)}>
                            Révoquer
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="cycles">
          <EmptyState
            icon={CalendarClock}
            title="Bientôt disponible"
            description="La création de cycles, la génération du calendrier et le suivi des cotisations arrivent dans une prochaine mise à jour."
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Retour aux groupes
    </button>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  )
}
