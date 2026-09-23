import { useAuth0 } from '@auth0/auth0-react'
import { LogOut, ShieldCheck, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const pageTitles: Array<{ prefix: string; title: string }> = [
  { prefix: '/explorer', title: 'Explorer' },
  { prefix: '/tontines', title: 'Mes tontines' },
  { prefix: '/paiements', title: 'Paiements' },
  { prefix: '/ndjoka-ai', title: 'Ndjoka AI' },
  { prefix: '/notifications', title: 'Notifications' },
  { prefix: '/profile', title: 'Mon profil' },
  { prefix: '/admin', title: 'Administration' },
]

export function pageTitleFor(pathname: string): string {
  return pageTitles.find((entry) => pathname.startsWith(entry.prefix))?.title ?? 'Tableau de bord'
}

export function Topbar({ pathname }: { pathname: string }) {
  const navigate = useNavigate()
  const { logout, user } = useAuth0()
  const profile = useCurrentUser()
  const isAdmin = ['support', 'platform_admin'].includes(profile.global_role)
  const displayName = profile.display_name ?? profile.email ?? 'Utilisateur Ndjoka'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Espace membre</p>
        <h1 className="truncate text-lg font-semibold text-foreground">{pageTitleFor(pathname)}</h1>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-colors hover:bg-accent"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile.avatar_url ?? user?.picture} alt="" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden text-left sm:block">
              <span className="block text-sm leading-tight font-medium text-foreground">{displayName}</span>
              <span className="block text-xs leading-tight text-muted-foreground capitalize">
                {profile.global_role.replace('_', ' ')}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate('/profile')}>
            <User /> Mon profil
          </DropdownMenuItem>
          {isAdmin ? (
            <DropdownMenuItem onSelect={() => navigate('/admin/users')}>
              <ShieldCheck /> Administration
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
          >
            <LogOut /> Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
