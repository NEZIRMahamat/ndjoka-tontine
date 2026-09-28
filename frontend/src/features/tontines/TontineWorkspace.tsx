import { useEffect, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowLeft, ArrowRight, CalendarClock, Coins, Copy, Layers3, UserMinus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { StatusBadge } from '@/components/shared/status-badge'
import { ScoreChip } from '@/components/shared/page-primitives'
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
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import {
  listCycles,
  type Cycle,
} from '@/features/tontines/cycles-api'
import {
  activeCycleOf,
  cycleFrequencyLabels,
  currentTurnOf,
  formatDate,
  initialsOf,
} from '@/features/tontines/tontine-presentation'
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
import TontineCyclesPanel from '@/features/tontines/TontineCyclesPanel'
import TontinePayoutsPanel from '@/features/tontines/TontinePayoutsPanel'

const roleLabels: Record<MembershipRole, string> = {
  owner: 'Organisateur',
  manager: 'Gestionnaire',
  treasurer: 'Trésorier',
  member: 'Participant',
}

export default function TontineWorkspace() {
  const { tontineId } = useParams<{ tontineId: string }>()
  const navigate = useNavigate()
  const profile = useCurrentUser()
  const { getAccessTokenSilently } = useAuth0()
  const confirm = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'overview'
  const [renderTime] = useState(() => Date.now())

  const [tontine, setTontine] = useState<Tontine | null>(null)
  const [members, setMembers] = useState<MembershipPage | null>(null)
  const [cycleState, setCycleState] = useState<{
    tontineId: string
    cycles: Cycle[]
    error: string
  }>({ tontineId: '', cycles: [], error: '' })
  const [invitations, setInvitations] = useState<InvitationPage | null>(null)
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [inviteRole, setInviteRole] = useState<Exclude<MembershipRole, 'owner'>>('member')
  const [editDiscoverable, setEditDiscoverable] = useState(false)
  const [editMinScore, setEditMinScore] = useState('none')

  useEffect(() => {
    if (!tontine) return
    setEditDiscoverable(tontine.is_discoverable)
    setEditMinScore(tontine.min_reliability_score ?? 'none')
  }, [tontine])

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

  useEffect(() => {
    if (!tontineId) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const page = await listCycles(token, tontineId, 0, controller.signal)
        if (active) setCycleState({ tontineId, cycles: page.items, error: '' })
      } catch (caught) {
        if (active && !controller.signal.aborted) {
          setCycleState({
            tontineId,
            cycles: [],
            error: messageOf(caught, 'Impossible de charger les cycles.'),
          })
        }
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload, tontineId])

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
        is_discoverable: editDiscoverable,
        min_reliability_score:
          editDiscoverable && editMinScore !== 'none' ? editMinScore : null,
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
        <BackLink onClick={() => navigate(tontineId ? `/tontines/${tontineId}` : '/tontines')} />
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      </div>
    )
  }

  if (loading || !tontine || !members) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate(tontineId ? `/tontines/${tontineId}` : '/tontines')} />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const myMembership = members.items.find((item) => item.user_id === profile.id && item.status === 'active')
  const canInvite = myMembership?.role === 'owner' || myMembership?.role === 'manager'
  const isOwner = myMembership?.role === 'owner'
  const writable = tontine.status !== 'archived'
  const activeMembers = members.items.filter((item) => item.status === 'active')
  const activeMembersCount = activeMembers.length
  const cycles = cycleState.tontineId === tontineId ? cycleState.cycles : []
  const cyclesError = cycleState.tontineId === tontineId ? cycleState.error : ''
  const overviewCycle = activeCycleOf(cycles)
  const overviewTurn = overviewCycle ? currentTurnOf(overviewCycle, [], new Date(renderTime)) : undefined
  const cyclePot =
    overviewCycle && activeMembersCount > 0
      ? Number(overviewCycle.contribution_amount) *
        Math.max(0, activeMembersCount - (overviewCycle.beneficiary_contributes ? 0 : 1))
      : 0

  return (
    <div className="space-y-6">
      <BackLink onClick={() => navigate(`/tontines/${tontine.id}`)} />

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
          <TabsTrigger value="payouts">Versements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" /></span>
                  <div><p className="text-xs text-muted-foreground">Membres actifs</p><p className="text-lg font-bold">{activeMembersCount}</p></div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarClock className="h-5 w-5" /></span>
                  <div>
                    <p className="text-xs text-muted-foreground">Fréquence</p>
                    <p className="text-sm font-bold">{overviewCycle ? cycleFrequencyLabels[overviewCycle.frequency] : 'À configurer'}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Coins className="h-5 w-5" /></span>
                  <div>
                    <p className="text-xs text-muted-foreground">Cagnotte attendue / tour</p>
                    <p className="text-sm font-bold">
                      {overviewCycle ? formatCurrencyAmount(cyclePot, tontine.currency) : '—'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {cyclesError ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {cyclesError}
              </p>
            ) : null}

            {overviewCycle && overviewTurn && ['active', 'scheduled'].includes(overviewCycle.status) ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary"><Layers3 className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-primary uppercase">Prochain tour</p>
                    <h3 className="mt-0.5 truncate font-semibold">
                      Tour {overviewTurn.position} — {
                        members.items.find((member) => member.id === overviewTurn.beneficiary_membership_id)?.display_name ??
                        `Membre ${overviewTurn.beneficiary_membership_id.slice(0, 8)}…`
                      }
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(overviewTurn.scheduled_for, overviewCycle.timezone)} · {overviewCycle.name}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/tontines/${tontine.id}/tour/${overviewTurn.id}`)}
                >
                  Voir le tour <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">Tours</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {overviewCycle ? `${overviewCycle.name} · ${cycleFrequencyLabels[overviewCycle.frequency]}` : 'Aucun cycle créé'}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSearchParams({ tab: 'cycles' })}>
                    Voir les cycles
                  </Button>
                </CardHeader>
                <CardContent>
                  {overviewCycle?.turns.length ? (
                    <ol className="divide-y divide-border">
                      {[...overviewCycle.turns].sort((left, right) => left.position - right.position).slice(0, 6).map((turn) => {
                        const member = members.items.find((item) => item.id === turn.beneficiary_membership_id)
                        const passed = new Date(turn.scheduled_for).getTime() < renderTime
                        const isNext =
                          ['active', 'scheduled'].includes(overviewCycle.status) &&
                          turn.id === overviewTurn?.id
                        const state = overviewCycle.status === 'completed'
                          ? 'Terminé'
                          : overviewCycle.status === 'cancelled'
                            ? 'Annulé'
                            : overviewCycle.status === 'draft'
                              ? 'Brouillon'
                          : isNext
                            ? 'Prochain tour'
                            : passed
                              ? 'Date planifiée passée'
                              : 'À venir'
                        return (
                          <li key={turn.id}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/40"
                              onClick={() => navigate(`/tontines/${tontine.id}/tour/${turn.id}`)}
                            >
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isNext ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                {turn.position}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{member?.display_name ?? `Membre ${turn.beneficiary_membership_id.slice(0, 8)}…`}</span>
                                <span className="block text-xs text-muted-foreground">{formatDate(turn.scheduled_for, overviewCycle.timezone)}</span>
                              </span>
                              <span className={`shrink-0 text-xs font-medium ${isNext ? 'text-primary' : 'text-muted-foreground'}`}>{state}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ol>
                  ) : (
                    <div className="py-5 text-center">
                      <p className="text-sm text-muted-foreground">
                        {overviewCycle ? 'Les tours seront disponibles une fois les membres réunis.' : 'Créez un brouillon de cycle pour définir les cotisations et les tours.'}
                      </p>
                      <Button className="mt-3" size="sm" variant="outline" onClick={() => setSearchParams({ tab: 'cycles' })}>
                        {overviewCycle ? 'Configurer les tours' : 'Créer un cycle'}
                      </Button>
                    </div>
                  )}
                  {overviewCycle && overviewCycle.turns.length > 6 ? (
                    <p className="mt-2 text-center text-xs text-muted-foreground">6 premiers tours affichés · consultez Cycles pour le calendrier complet.</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Membres ({activeMembersCount})</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setSearchParams({ tab: 'members' })}>
                    Voir tous
                  </Button>
                </CardHeader>
                <CardContent>
                  {activeMembers.length ? (
                    <ul className="divide-y divide-border">
                      {activeMembers.slice(0, 6).map((member) => {
                        const label = member.display_name ?? `Membre ${member.user_id.slice(0, 8)}…`
                        return (
                          <li key={member.id} className="flex items-center gap-3 py-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{initialsOf(label)}</span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}{member.user_id === profile.id ? ' · Vous' : ''}</span>
                            <Badge variant="secondary">{roleLabels[member.role]}</Badge>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="py-5 text-center text-sm text-muted-foreground">Aucun membre actif.</p>
                  )}
                  {activeMembers.length > 6 ? (
                    <p className="mt-2 text-center text-xs text-muted-foreground">+{activeMembers.length - 6} autres membres</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>

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
                  <SummaryItem
                    label="Visibilité"
                    value={tontine.is_discoverable ? 'Ouverte dans l’Explorer' : 'Sur invitation'}
                  />
                  <SummaryItem
                    label="Fiabilité exigée"
                    value={
                      tontine.min_reliability_score
                        ? `${Math.round(Number(tontine.min_reliability_score) * 100)} / 100`
                        : 'Aucune'
                    }
                  />
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
                      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
                        <label className="flex items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-primary"
                            checked={editDiscoverable}
                            onChange={(event) => setEditDiscoverable(event.target.checked)}
                          />
                          <span>
                            <span className="font-medium text-foreground">Visible dans l’Explorer</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              Les épargnants compatibles peuvent la rejoindre sans invitation.
                            </span>
                          </span>
                        </label>
                        {editDiscoverable ? (
                          <div className="space-y-1.5">
                            <Label htmlFor="edit-min-score">Exigence de fiabilité</Label>
                            <Select value={editMinScore} onValueChange={setEditMinScore}>
                              <SelectTrigger id="edit-min-score" className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Ouverte à tous</SelectItem>
                                <SelectItem value="0.450">Score moyen minimum</SelectItem>
                                <SelectItem value="0.650">Bon score minimum</SelectItem>
                                <SelectItem value="0.800">Excellent score minimum</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
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
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                      <button type="button" className="truncate hover:text-primary hover:underline" onClick={() => navigate(member.user_id === profile.id ? '/profile' : `/members/${member.user_id}`)}>
                        {member.user_id === profile.id ? 'Vous' : member.display_name?.trim() || `Membre ${member.user_id.slice(0, 8)}`}
                      </button>
                      <ScoreChip score={member.reliability_score} provisional={member.reliability_provisional} />
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
          <TontineCyclesPanel
            tontineId={tontine.id}
            currency={tontine.currency}
            canManage={canInvite}
            isArchived={!writable}
          />
        </TabsContent>

        <TabsContent value="payouts">
          <TontinePayoutsPanel
            tontineId={tontine.id}
            currency={tontine.currency}
            canManage={canInvite}
            isArchived={!writable}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Retour à la tontine
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
