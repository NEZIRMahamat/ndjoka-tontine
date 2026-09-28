import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  ArrowRight,
  Bell,
  ChevronDown,
  Compass,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Mail,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { NdjokaLogoFull } from '@/components/brand/NdjokaLogo'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

type SidebarLinkProps = { to: string; icon: LucideIcon; label: string; collapsed: boolean; violet?: boolean; end?: boolean }

function SidebarLink({ to, icon: Icon, label, collapsed, violet = false, end }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center rounded-lg font-medium transition-all',
          collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3',
          isActive
            ? violet
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
              : 'bg-emerald-600 text-white shadow-md'
            : violet
              ? 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
              : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} className="shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden whitespace-nowrap text-sm"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
          {!collapsed && violet && !isActive && (
            <span className="ml-auto rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-600">IA</span>
          )}
          {collapsed && (
            <span className="pointer-events-none absolute left-full z-50 ml-4 rounded-md bg-slate-800 px-2.5 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function MobileNavLink({ to, icon: Icon, label, violet = false, end }: { to: string; icon: LucideIcon; label: string; violet?: boolean; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex w-full flex-col items-center justify-center p-2 text-xs font-medium transition-colors',
          isActive ? (violet ? 'text-violet-600' : 'text-emerald-600') : cn('text-slate-500', violet ? 'hover:text-violet-600' : 'hover:text-emerald-600'),
        )
      }
    >
      <Icon size={24} className="mb-1" />
      <span className="max-w-[64px] truncate">{label}</span>
    </NavLink>
  )
}

function HamburgerLines() {
  return (
    <span className="flex flex-col items-center gap-[4px]">
      <span className="block h-[1.5px] w-[14px] rounded-full bg-slate-500" />
      <span className="block h-[1.5px] w-[14px] rounded-full bg-slate-500" />
      <span className="block h-[1.5px] w-[14px] rounded-full bg-slate-500" />
    </span>
  )
}

const pageTitles: Array<{ match: (path: string) => boolean; title: string }> = [
  { match: (p) => p === '/', title: 'Tableau de bord' },
  { match: (p) => p === '/explore', title: 'Explorer' },
  { match: (p) => p.startsWith('/explore/'), title: 'Détail tontine' },
  { match: (p) => p.startsWith('/guides/'), title: 'Conseils Tontine' },
  { match: (p) => p === '/tontines/create', title: 'Créer une tontine' },
  { match: (p) => p.startsWith('/tontines/') && p.includes('/tour/'), title: 'Détail du tour' },
  { match: (p) => p.startsWith('/tontines/') && p.endsWith('/gestion'), title: 'Gestion de la tontine' },
  { match: (p) => p.startsWith('/tontines/'), title: 'Tontine' },
  { match: (p) => p === '/tontines', title: 'Mes Tontines' },
  { match: (p) => p === '/payments', title: 'Paiements' },
  { match: (p) => p.startsWith('/payments/history'), title: 'Historique' },
  { match: (p) => p === '/ndjoka-ai', title: 'Ndjoka AI' },
  { match: (p) => p === '/profile/info', title: 'Informations personnelles' },
  { match: (p) => p === '/profile/payment-methods', title: 'Moyens de paiement' },
  { match: (p) => p === '/profile/security', title: 'Sécurité & Confidentialité' },
  { match: (p) => p === '/profile/notifications', title: 'Notifications' },
  { match: (p) => p === '/profile/savings', title: "Profil d'épargnant" },
  { match: (p) => p.startsWith('/profile'), title: 'Mon Profil' },
  { match: (p) => p.startsWith('/members/'), title: 'Profil membre' },
  { match: (p) => p.startsWith('/admin'), title: 'Administration' },
  { match: (p) => p === '/frais', title: 'Nos frais' },
  { match: (p) => p === '/cgu', title: "Conditions générales d'utilisation" },
  { match: (p) => p === '/confidentialite', title: 'Politique de confidentialité' },
  { match: (p) => p === '/a-propos', title: 'À propos' },
  { match: (p) => p === '/equipe', title: "L'équipe Ndjoka" },
]

export function pageTitleFor(pathname: string): string {
  return pageTitles.find((entry) => entry.match(pathname))?.title ?? 'Ndjoka'
}

const SOCIAL_LINKS = [
  { label: 'X (Twitter)', href: '#', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  { label: 'LinkedIn', href: '#', path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z' },
  { label: 'Instagram', href: '#', path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z' },
]

export function SiteFooter({ compact = false }: { compact?: boolean }) {
  const columns = [
    {
      title: 'Plateforme',
      links: [
        { label: 'Explorer les tontines', to: '/explore' },
        { label: 'Mes Tontines', to: '/tontines' },
        { label: 'Nos frais', to: '/frais' },
        { label: 'Ndjoka AI', to: '/ndjoka-ai' },
      ],
    },
    {
      title: 'Ndjoka',
      links: [
        { label: 'À propos', to: '/a-propos' },
        { label: "L'équipe", to: '/equipe' },
        { label: 'Conseils Tontine', to: '/guides/choisir-premiere-tontine' },
        { label: 'Contactez-nous', to: 'mailto:contact@ndjoka-tontine.com' },
      ],
    },
    {
      title: 'Légal',
      links: [
        { label: "Conditions d'utilisation", to: '/cgu' },
        { label: 'Confidentialité', to: '/confidentialite' },
        { label: 'Fonds de solidarité', to: '/frais#fonds-de-solidarite' },
      ],
    },
  ]
  return (
    <footer className={cn('overflow-hidden rounded-2xl', compact ? 'mt-8' : 'mt-16')}>
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 px-8 pt-10 pb-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="space-y-4 md:col-span-1">
            <NdjokaLogoFull className="h-8 w-auto opacity-90 brightness-0 invert" />
            <p className="text-sm leading-relaxed text-slate-400">
              L'épargne communautaire réinventée : sécurisée, transparente et accessible à tous.
            </p>
            <div className="flex items-center gap-2 pt-1">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-400 transition-all hover:bg-emerald-500 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden><path d={social.path} /></svg>
                </a>
              ))}
            </div>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h4 className="mb-4 text-xs font-bold tracking-widest text-emerald-400 uppercase">{column.title}</h4>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.to.startsWith('mailto:') ? (
                      <a href={link.to} className="group flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white">
                        <ArrowRight size={11} className="-ml-1 text-emerald-400 opacity-0 transition-all group-hover:ml-0 group-hover:opacity-100" />
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.to} className="group flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white">
                        <ArrowRight size={11} className="-ml-1 text-emerald-400 opacity-0 transition-all group-hover:ml-0 group-hover:opacity-100" />
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-8 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold text-white">Restez informé</p>
            <p className="mt-0.5 text-xs text-slate-400">Conseils, nouveautés et opportunités tontine dans votre boîte mail.</p>
          </div>
          <form
            className="flex w-full gap-2 md:w-auto"
            onSubmit={(event) => {
              event.preventDefault()
              window.location.href = 'mailto:contact@ndjoka-tontine.com?subject=Newsletter%20Ndjoka'
            }}
          >
            <div className="relative flex-1 md:w-64">
              <Mail size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                placeholder="votre@email.com"
                aria-label="Adresse e-mail pour la newsletter"
                className="w-full rounded-xl border border-white/15 bg-white/10 py-2.5 pr-4 pl-9 text-sm text-white placeholder-slate-500 transition-all focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 focus:outline-none"
              />
            </div>
            <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-emerald-400">
              S'inscrire
            </button>
          </form>
        </div>
      </div>
      <div className="flex flex-col items-center justify-between gap-2 bg-slate-950 px-8 py-4 md:flex-row">
        <span className="text-xs text-slate-500">© {new Date().getFullYear()} Ndjoka SAS. Tous droits réservés.</span>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck size={12} className="text-emerald-600" />
          Paiements via un prestataire agréé · Données chiffrées
        </div>
      </div>
    </footer>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 1023px)').matches)
  const [profileOpen, setProfileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { logout, user } = useAuth0()
  const profile = useCurrentUser()
  const isAdmin = ['support', 'platform_admin'].includes(profile.global_role)
  const displayName = profile.display_name?.trim() || user?.name || profile.email || 'Membre Ndjoka'
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ND'

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setProfileOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      <motion.aside
        animate={{ width: collapsed ? 64 : 256 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className="relative z-20 hidden h-full shrink-0 border-r border-slate-200 bg-white md:block"
      >
        <div className={cn('flex h-full flex-col overflow-hidden', collapsed ? 'px-2' : 'px-3')}>
          <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto pt-5 pb-4" aria-label="Navigation principale">
            <SidebarLink to="/" icon={LayoutDashboard} label="Accueil" collapsed={collapsed} end />
            <SidebarLink to="/explore" icon={Compass} label="Explorer" collapsed={collapsed} />
            <SidebarLink to="/tontines" icon={Users} label="Mes Tontines" collapsed={collapsed} />
            <SidebarLink to="/payments" icon={CreditCard} label="Paiement" collapsed={collapsed} />
            <div className="pt-2">
              <SidebarLink to="/ndjoka-ai" icon={Sparkles} label="Ndjoka AI" collapsed={collapsed} violet />
            </div>
            {isAdmin && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <SidebarLink to="/admin/users" icon={ShieldCheck} label="Administration" collapsed={collapsed} />
              </div>
            )}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Ouvrir la navigation' : 'Réduire la navigation'}
          className="absolute top-[14px] right-0 z-30 flex h-9 w-7 translate-x-1/2 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50"
        >
          <HamburgerLines />
        </button>
      </motion.aside>

      <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white/80 px-5 shadow-[0_1px_0_0_rgba(0,0,0,0.04),0_2px_12px_0_rgba(0,0,0,0.03)] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 md:flex">
              <Link to="/" aria-label="Accueil Ndjoka">
                <NdjokaLogoFull className="h-7 w-auto shrink-0 opacity-90" />
              </Link>
              <span className="h-4 w-px shrink-0 bg-slate-200" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight text-slate-800">{pageTitleFor(location.pathname)}</span>
              <span className="hidden text-[11px] font-medium tracking-wide text-slate-400 uppercase md:block">Ndjoka · Tontine Digitale</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <div className="relative hidden items-center md:flex">
              <button
                type="button"
                onClick={() => setProfileOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 transition-all',
                  profileOpen ? 'border-emerald-200 bg-emerald-50 shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
                )}
              >
                <Avatar className="h-8 w-8 ring-2 ring-emerald-100">
                  <AvatarImage src={profile.avatar_url ?? user?.picture} alt="" />
                  <AvatarFallback className="bg-emerald-600 text-xs font-bold text-white">{initials}</AvatarFallback>
                </Avatar>
                <div className="text-left leading-tight">
                  <div className="max-w-[160px] truncate text-sm font-semibold text-slate-700">{displayName}</div>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                    <ShieldCheck size={10} />
                    {profile.global_role === 'platform_admin' ? 'Administrateur' : profile.global_role === 'support' ? 'Support' : 'Compte vérifié'}
                  </div>
                </div>
                <ChevronDown size={13} className={cn('ml-0.5 text-slate-400 transition-transform', profileOpen && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, scale: 0.96, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -6 }}
                      transition={{ duration: 0.14, ease: 'easeOut' }}
                      className="absolute top-full right-0 z-40 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl"
                    >
                      <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 ring-2 ring-white">
                            <AvatarImage src={profile.avatar_url ?? user?.picture} alt="" />
                            <AvatarFallback className="bg-emerald-600 text-sm font-bold text-white">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-800">{displayName}</div>
                            <div className="truncate text-xs text-slate-500">{profile.email ?? user?.email ?? 'Compte Ndjoka'}</div>
                          </div>
                        </div>
                      </div>
                      <div className="py-1.5">
                        <button type="button" onClick={() => navigate('/profile')} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-emerald-700">
                          <UserCircle size={15} className="text-slate-400" /> Mon Profil
                        </button>
                        <button type="button" onClick={() => navigate('/profile/notifications')} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-emerald-700">
                          <Bell size={15} className="text-slate-400" /> Notifications
                        </button>
                        <button type="button" onClick={() => navigate('/profile/security')} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-emerald-700">
                          <Settings size={15} className="text-slate-400" /> Paramètres
                        </button>
                        {isAdmin && (
                          <button type="button" onClick={() => navigate('/admin/users')} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-emerald-700">
                            <ShieldCheck size={15} className="text-slate-400" /> Administration
                          </button>
                        )}
                      </div>
                      <div className="border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50"
                        >
                          <LogOut size={15} /> Déconnexion
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <button type="button" onClick={() => navigate('/profile')} className="md:hidden" aria-label="Mon profil">
              <Avatar className="h-8 w-8 ring-2 ring-emerald-100">
                <AvatarImage src={profile.avatar_url ?? user?.picture} alt="" />
                <AvatarFallback className="bg-emerald-600 text-xs font-bold text-white">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 md:pb-8">
          {children}
          <SiteFooter />
        </div>

        <nav className="pb-safe fixed right-0 bottom-0 left-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white px-2 py-1 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:hidden" aria-label="Navigation mobile">
          <MobileNavLink to="/" icon={LayoutDashboard} label="Accueil" end />
          <MobileNavLink to="/explore" icon={Compass} label="Explorer" />
          <MobileNavLink to="/tontines" icon={Users} label="Tontines" />
          <MobileNavLink to="/payments" icon={CreditCard} label="Paiement" />
          <MobileNavLink to="/ndjoka-ai" icon={Sparkles} label="Ndjoka AI" violet />
        </nav>
      </main>
    </div>
  )
}
