import { Outlet } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { ConfirmProvider } from '@/components/shared/confirm-dialog'
import { Toaster } from '@/components/ui/sonner'

export function AppLayout() {
  return (
    <ConfirmProvider>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster position="top-center" richColors closeButton />
    </ConfirmProvider>
  )
}
