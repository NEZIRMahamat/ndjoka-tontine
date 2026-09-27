import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { ConfirmProvider } from '@/components/shared/confirm-dialog'
import { Toaster } from '@/components/ui/sonner'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const location = useLocation()
  const profile = useCurrentUser()
  const isAdmin = ['support', 'platform_admin'].includes(profile.global_role)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const updateCollapsed = (event: MediaQueryListEvent) => setCollapsed(event.matches)
    media.addEventListener('change', updateCollapsed)
    return () => media.removeEventListener('change', updateCollapsed)
  }, [])

  return (
    <ConfirmProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} isAdmin={isAdmin} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar pathname={location.pathname} />
          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7 xl:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <Toaster position="top-center" richColors closeButton />
    </ConfirmProvider>
  )
}
