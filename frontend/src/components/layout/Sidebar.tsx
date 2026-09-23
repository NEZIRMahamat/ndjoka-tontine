import { ChevronLeft, Compass, LayoutDashboard, ShieldCheck, Sparkles, Users, Wallet, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import ndjokaLogo from '@/assets/ndjoka_logo.svg'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; icon: LucideIcon }

const navItems: NavItem[] = [
  { to: '/', label: 'Accueil', icon: LayoutDashboard },
  { to: '/explorer', label: 'Explorer', icon: Compass },
  { to: '/tontines', label: 'Mes tontines', icon: Users },
  { to: '/paiements', label: 'Paiements', icon: Wallet },
  { to: '/ndjoka-ai', label: 'Ndjoka AI', icon: Sparkles },
]

export function Sidebar({
  collapsed,
  onToggle,
  isAdmin,
}: {
  collapsed: boolean
  onToggle: () => void
  isAdmin: boolean
}) {
  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-64',
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-3">
        <img
          src={ndjokaLogo}
          alt="Ndjoka"
          className={cn('h-9 w-[130px] object-contain object-left transition-opacity', collapsed && 'w-0 opacity-0')}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={collapsed ? 'Déplier le menu' : 'Plier le menu'}
          aria-expanded={!collapsed}
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2" aria-label="Navigation principale">
        {navItems.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} />
        ))}
        {isAdmin ? (
          <>
            <div className="my-2 border-t border-sidebar-border" />
            <SidebarLink item={{ to: '/admin/users', label: 'Administration', icon: ShieldCheck }} collapsed={collapsed} />
          </>
        ) : null}
      </nav>
    </aside>
  )
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          collapsed && 'justify-center px-2',
          isActive && 'bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground',
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </NavLink>
  )
}
