import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Info,
  LockKeyhole,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useCurrentUserState } from '@/app/current-user-context'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { messageOf } from '@/lib/http'
import { deactivateCurrentUser, updateCurrentUser, type CurrentUserResponse } from '@/features/profile/profile-api'
import { getReliability, type Reliability } from '@/features/profile/saver-profile-api'
import SaverProfileSection from '@/features/profile/SaverProfileSection'

type ProfileSection = 'overview' | 'personal' | 'savings' | 'payments' | 'security' | 'notifications'
type ProfileChanges = Parameters<typeof updateCurrentUser>[1]

const roleLabels = { user: 'Membre', support: 'Support', platform_admin: 'Administrateur' }

function displayName(profile: CurrentUserResponse) {
  return profile.display_name?.trim() || profile.email || 'Membre Ndjoka'
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('fr-FR') || 'ND'
}

function ReliabilityScore({
  reliability,
  loading,
  error,
}: {
  reliability: Reliability | null
  loading: boolean
  error: string
}) {
  const parsedScore = reliability ? Number(reliability.score) : 0
  const score = Number.isFinite(parsedScore) ? Math.min(100, Math.max(0, Math.round(parsedScore * 100))) : 0
  const circumference = 201

  return (
    <div
      className="relative flex min-w-24 flex-col items-center justify-center"
      aria-label={reliability ? `Fiabilité : ${score} sur 100` : 'Score de fiabilité'}
    >
      <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Fiabilité</p>
      <div className="relative flex h-[76px] w-[76px] items-center justify-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r="32" fill="none" className="stroke-muted" strokeWidth="6" />
          {reliability ? (
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="none"
              className="stroke-emerald-500"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (circumference * score) / 100}
              strokeLinecap="round"
              strokeWidth="6"
            />
          ) : null}
        </svg>
        <span className="text-xl font-bold text-foreground">
          {loading ? '…' : reliability ? score : '—'}
        </span>
      </div>
      {reliability ? (
        <Badge variant="outline" className="mt-1 border-emerald-200 bg-emerald-50 text-emerald-700">
          {reliability.is_provisional ? 'Provisoire' : reliability.band === 'bon' ? 'Bon' : reliability.band === 'excellent' ? 'Excellent' : reliability.band === 'moyen' ? 'À progresser' : 'À consolider'}
        </Badge>
      ) : error ? (
        <span role="status" className="mt-1 max-w-36 text-center text-[10px] leading-4 text-muted-foreground">{error}</span>
      ) : (
        <span className="mt-1 text-[10px] text-muted-foreground">sur 100</span>
      )}
    </div>
  )
}

function ProfileIdentity({
  profile,
  reliability,
  reliabilityLoading,
  reliabilityError,
}: {
  profile: CurrentUserResponse
  reliability: Reliability | null
  reliabilityLoading: boolean
  reliabilityError: string
}) {
  const name = displayName(profile)
  const memberSince = new Date(profile.created_at)

  return (
    <Card className="relative overflow-hidden rounded-2xl border-slate-100 shadow-sm">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-emerald-50/80" />
      <CardContent className="relative flex flex-col items-center gap-5 p-5 sm:flex-row sm:gap-6 sm:p-6">
        <div className="relative shrink-0">
          <Avatar className="h-20 w-20 border-4 border-white shadow-sm sm:h-24 sm:w-24">
            <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-emerald-600 text-xl font-bold text-white">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <Link
            to="/profile?section=personal"
            aria-label="Modifier mon profil"
            className="absolute bottom-0 right-0 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <Settings className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="truncate text-xl font-bold tracking-tight text-slate-800">{name}</h2>
          <p className="mt-1 truncate text-sm text-slate-500">{profile.email ?? 'Adresse e-mail gérée par Auth0'}</p>
          <p className="mt-1 text-xs text-slate-400">
            Membre depuis{' '}
            {Number.isNaN(memberSince.getTime())
              ? '—'
              : memberSince.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
              <Check className="mr-1 h-3 w-3" />
              {profile.status === 'active' ? 'Compte actif' : profile.status}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
              {roleLabels[profile.global_role]}
            </Badge>
          </div>
        </div>

        <ReliabilityScore
          reliability={reliability}
          loading={reliabilityLoading}
          error={reliabilityError}
        />
      </CardContent>
    </Card>
  )
}

function ProfileSetting({
  icon: Icon,
  iconClass,
  title,
  description,
  to,
}: {
  icon: LucideIcon
  iconClass: string
  title: string
  description: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="group flex w-full items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none sm:px-5"
    >
      <span className="flex min-w-0 items-center gap-3.5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-sm font-semibold text-slate-700">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-slate-400">{description}</span>
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-emerald-600" />
    </Link>
  )
}

function BackToProfile({ children }: { children: ReactNode }) {
  return (
    <Link
      to="/profile"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-emerald-700"
    >
      <ArrowLeft className="h-4 w-4" />
      {children}
    </Link>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
      <h2 className="font-bold text-slate-800">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  )
}

function PersonalInfoSection({
  profile,
  saving,
  error,
  onSave,
  onDeactivate,
}: {
  profile: CurrentUserResponse
  saving: boolean
  error: string
  onSave: (changes: ProfileChanges) => Promise<void>
  onDeactivate: () => Promise<void>
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await onSave({
      display_name: String(data.get('display_name')).trim(),
      avatar_url: String(data.get('avatar_url')).trim() || null,
      locale: String(data.get('locale')).trim(),
      timezone: String(data.get('timezone')).trim(),
    })
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-2xl border-slate-100 shadow-sm">
        <SectionHeader title="Informations personnelles" description="Ces informations sont utilisées pour votre compte Ndjoka." />
        <CardContent className="p-5 sm:p-6">
          <form key={profile.updated_at} onSubmit={submit} className="space-y-4">
            <fieldset disabled={saving} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="display_name">Nom affiché</Label>
                <Input id="display_name" name="display_name" defaultValue={profile.display_name ?? ''} required maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Adresse e-mail</Label>
                <Input id="email" value={profile.email ?? ''} readOnly disabled aria-describedby="email-help" />
                <p id="email-help" className="text-xs text-muted-foreground">L’adresse de connexion est gérée par Auth0.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avatar_url">Photo de profil (URL facultative)</Label>
                <Input id="avatar_url" name="avatar_url" type="url" defaultValue={profile.avatar_url ?? ''} placeholder="https://…" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="locale">Langue</Label>
                  <Input id="locale" name="locale" defaultValue={profile.locale} required maxLength={35} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Fuseau horaire</Label>
                  <Input id="timezone" name="timezone" defaultValue={profile.timezone} required maxLength={100} />
                </div>
              </div>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </Button>
            </fieldset>
          </form>
          {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-destructive/20 shadow-sm">
        <SectionHeader title="Désactivation du compte" description="Vous pourrez demander de l’aide à l’assistance avant de continuer." />
        <CardContent className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center sm:p-6">
          <p className="max-w-lg text-sm leading-6 text-muted-foreground">
            La désactivation bloque l’accès aux fonctionnalités métier. Vos données sont conservées.
          </p>
          <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" disabled={saving} onClick={() => void onDeactivate()}>
            <LogOut className="mr-2 h-4 w-4" />
            Désactiver mon compte
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function PaymentsSection() {
  return (
    <Card className="overflow-hidden rounded-2xl border-slate-100 shadow-sm">
      <SectionHeader title="Moyens de paiement" description="Informations sur le suivi de vos cotisations et versements." />
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-sm font-semibold text-slate-700">Aucun moyen de paiement enregistré</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Ndjoka suit les déclarations de cotisation et de versement par cycle. L’application ne stocke pas de carte bancaire ni de compte Mobile Money.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link to="/paiements">
            <CreditCard className="mr-2 h-4 w-4" />
            Consulter mes cotisations et versements
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function SecuritySection({
  profile,
  onLogout,
}: {
  profile: CurrentUserResponse
  onLogout: () => void
}) {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-2xl border-slate-100 shadow-sm">
        <SectionHeader title="Sécurité et confidentialité" description="La connexion et les identifiants sont protégés par Auth0." />
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-700">Authentification gérée par Auth0</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Le mot de passe et les options de vérification dépendent de votre fournisseur de connexion. Ndjoka ne permet pas de modifier ces paramètres ici.
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identité de connexion</p>
            <p className="mt-1 break-all text-sm text-slate-700">{profile.email ?? 'Adresse e-mail non disponible'}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="overflow-hidden rounded-2xl border-slate-100 shadow-sm">
        <SectionHeader title="Session" description="Fermez votre session sur cet appareil." />
        <CardContent className="p-5 sm:p-6">
          <Button variant="outline" onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function NotificationsSection() {
  return (
    <Card className="overflow-hidden rounded-2xl border-slate-100 shadow-sm">
      <SectionHeader title="Notifications" description="Restez informé de l’activité de vos tontines." />
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-slate-700">Les alertes de votre compte restent actives</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Vous recevez les notifications liées aux cycles et cotisations dans Ndjoka. La gestion de préférences individuelles par canal ou par type n’est pas encore disponible.
            </p>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
          Consultez la cloche de notifications en haut de l’application pour retrouver vos alertes.
        </p>
      </CardContent>
    </Card>
  )
}

function ProfilePageContent() {
  const { state, setProfile } = useCurrentUserState()
  const { getAccessTokenSilently, logout } = useAuth0()
  const confirm = useConfirm()
  const [searchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const sections: ProfileSection[] = ['overview', 'personal', 'savings', 'payments', 'security', 'notifications']
  const section = sections.find((candidate) => candidate === requestedSection) ?? 'overview'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reliability, setReliability] = useState<Reliability | null>(null)
  const [reliabilityLoading, setReliabilityLoading] = useState(true)
  const [reliabilityError, setReliabilityError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadReliability() {
      try {
        const token = await getAccessTokenSilently()
        const result = await getReliability(token, controller.signal)
        if (!controller.signal.aborted) setReliability(result)
      } catch (caught) {
        if (!controller.signal.aborted) setReliabilityError(messageOf(caught, 'Chargement impossible'))
      } finally {
        if (!controller.signal.aborted) setReliabilityLoading(false)
      }
    }
    void loadReliability()
    return () => controller.abort()
  }, [getAccessTokenSilently])

  async function saveProfile(changes: ProfileChanges) {
    setSaving(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      const updated = await updateCurrentUser(token, changes)
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

  if (state.status === 'loading') {
    return <div className="mx-auto max-w-2xl space-y-5"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
  }
  if (state.status === 'error') {
    return <p role="alert" className="mx-auto max-w-2xl rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{state.message}</p>
  }

  const profile = state.profile

  if (section === 'personal') {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <BackToProfile>Mon profil</BackToProfile>
        <PersonalInfoSection profile={profile} saving={saving} error={error} onSave={saveProfile} onDeactivate={deactivate} />
      </div>
    )
  }
  if (section === 'savings') {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <BackToProfile>Mon profil</BackToProfile>
        <div>
          <p className="text-[11px] font-bold tracking-[0.12em] text-emerald-700 uppercase">Préférences</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-800">Mon profil d’épargne</h1>
          <p className="mt-1 text-sm text-slate-500">Adaptez les propositions de tontine à vos objectifs et à votre rythme.</p>
        </div>
        <SaverProfileSection />
      </div>
    )
  }
  if (section === 'payments') {
    return <div className="mx-auto max-w-2xl space-y-5"><BackToProfile>Mon profil</BackToProfile><PaymentsSection /></div>
  }
  if (section === 'security') {
    return <div className="mx-auto max-w-2xl space-y-5"><BackToProfile>Mon profil</BackToProfile><SecuritySection profile={profile} onLogout={() => void logout({ logoutParams: { returnTo: window.location.origin } })} /></div>
  }
  if (section === 'notifications') {
    return <div className="mx-auto max-w-2xl space-y-5"><BackToProfile>Mon profil</BackToProfile><NotificationsSection /></div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="px-1">
        <p className="text-[11px] font-bold tracking-[0.13em] text-emerald-700 uppercase">Mon espace</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800">Mon profil</h1>
        <p className="mt-1 text-sm text-slate-500">Gérez vos informations et les préférences de votre compte.</p>
      </header>

      <ProfileIdentity
        profile={profile}
        reliability={reliability}
        reliabilityLoading={reliabilityLoading}
        reliabilityError={reliabilityError}
      />

      <Card className="overflow-hidden rounded-2xl border-slate-100 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <CardTitle className="text-xs font-bold tracking-[0.1em] text-slate-500 uppercase">Mon espace</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 p-0">
          <ProfileSetting
            icon={UserRound}
            iconClass="bg-blue-50 text-blue-700"
            title="Informations personnelles"
            description="Nom affiché et préférences de compte"
            to="/profile?section=personal"
          />
          <ProfileSetting
            icon={Sparkles}
            iconClass="bg-emerald-50 text-emerald-700"
            title="Préférences d’épargne"
            description="Vos objectifs, votre rythme et votre score de fiabilité"
            to="/profile?section=savings"
          />
          <ProfileSetting
            icon={WalletCards}
            iconClass="bg-teal-50 text-teal-700"
            title="Moyens de paiement"
            description="Suivi des cotisations et versements, sans carte enregistrée"
            to="/profile?section=payments"
          />
          <ProfileSetting
            icon={LockKeyhole}
            iconClass="bg-violet-50 text-violet-700"
            title="Sécurité et confidentialité"
            description="Connexion gérée par Auth0"
            to="/profile?section=security"
          />
          <ProfileSetting
            icon={Bell}
            iconClass="bg-amber-50 text-amber-700"
            title="Notifications"
            description="Alertes liées à vos cycles et cotisations"
            to="/profile?section=notifications"
          />
        </CardContent>
      </Card>

      <Button
        variant="outline"
        onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
        className="h-12 w-full rounded-xl border-red-200 bg-white font-semibold text-red-600 shadow-sm hover:border-red-300 hover:bg-red-50 hover:text-red-700"
      >
        <LogOut className="mr-2 h-4 w-4" />
        Se déconnecter
      </Button>
    </div>
  )
}

export default function ProfilePage() {
  return <ProfilePageContent />
}
