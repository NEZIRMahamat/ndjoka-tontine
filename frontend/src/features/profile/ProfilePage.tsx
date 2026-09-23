import { useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { toast } from 'sonner'

import { useCurrentUserState } from '@/app/current-user-context'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { messageOf } from '@/lib/http'
import { deactivateCurrentUser, updateCurrentUser } from '@/features/profile/profile-api'

const roleLabels = { user: 'Utilisateur', support: 'Support', platform_admin: 'Administrateur' }

export default function ProfilePage() {
  const { state, setProfile } = useCurrentUserState()
  const profile = state.status === 'success' ? state.profile : null
  const { getAccessTokenSilently, logout } = useAuth0()
  const confirm = useConfirm()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!profile) return null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      const updated = await updateCurrentUser(token, {
        display_name: String(data.get('display_name')).trim(),
        avatar_url: String(data.get('avatar_url')).trim() || null,
        locale: String(data.get('locale')).trim(),
        timezone: String(data.get('timezone')).trim(),
      })
      setProfile(updated)
      toast.success('Votre profil a été mis à jour.')
    } catch (caught) {
      setError(messageOf(caught, 'Mise à jour impossible'))
    } finally {
      setSaving(false)
    }
  }

  async function deactivate() {
    const confirmed = await confirm({
      title: 'Désactiver votre compte ?',
      description: 'Cette action bloque immédiatement les routes métier. Vos données sont conservées.',
      confirmLabel: 'Désactiver',
      destructive: true,
    })
    if (!confirmed) return

    setSaving(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      await deactivateCurrentUser(token)
      void logout({ logoutParams: { returnTo: window.location.origin } })
    } catch (caught) {
      setError(messageOf(caught, 'Désactivation impossible'))
      setSaving(false)
    }
  }

  const initials = (profile.display_name ?? profile.email ?? 'ND').slice(0, 2).toUpperCase()

  return (
    <div className="space-y-6">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Mon espace</p>
          <h2 className="mt-1 text-2xl font-bold text-foreground">Mon profil Ndjoka</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Vos préférences métier sont enregistrées dans PostgreSQL. Auth0 conserve votre identité de connexion.
          </p>
        </div>
        <Badge variant="secondary" className="capitalize">
          {roleLabels[profile.global_role]}
        </Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(240px,0.6fr)_minmax(0,1.4fr)]">
        <Card>
          <CardContent className="flex flex-col items-center pt-6 text-center">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              {profile.display_name ?? profile.email ?? 'Membre Ndjoka'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{profile.email ?? 'E-mail non exposé par le token'}</p>
            <dl className="mt-6 w-full space-y-3 border-t border-border pt-4 text-left">
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted-foreground">Statut</dt>
                <dd className="flex items-center gap-1.5 font-medium text-foreground capitalize">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {profile.status}
                </dd>
              </div>
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted-foreground">Compte créé</dt>
                <dd className="font-medium text-foreground">
                  {new Date(profile.created_at).toLocaleDateString('fr-FR')}
                </dd>
              </div>
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted-foreground">Identifiant</dt>
                <dd className="font-mono text-xs text-foreground">{profile.id.slice(0, 8)}…</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Préférences</p>
            <CardTitle className="text-base">Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <fieldset disabled={saving} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="display_name">Nom affiché</Label>
                  <Input id="display_name" name="display_name" defaultValue={profile.display_name ?? ''} required maxLength={120} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="avatar_url">URL de l’avatar (facultative)</Label>
                  <Input id="avatar_url" name="avatar_url" type="url" defaultValue={profile.avatar_url ?? ''} placeholder="https://…" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="locale">Langue</Label>
                    <Input id="locale" name="locale" defaultValue={profile.locale} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="timezone">Fuseau horaire</Label>
                    <Input id="timezone" name="timezone" defaultValue={profile.timezone} required />
                  </div>
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer le profil'}
                </Button>
              </fieldset>
            </form>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-start justify-between gap-4 pt-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-semibold text-destructive">Zone sensible</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              La désactivation est logique : vos données sont conservées, mais l’accès métier est bloqué.
            </p>
          </div>
          <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" disabled={saving} onClick={deactivate}>
            Désactiver mon compte
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
