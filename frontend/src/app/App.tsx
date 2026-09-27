import { lazy, Suspense, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AppLayout } from '@/app/AppLayout'
import { CurrentUserProvider, useCurrentUser, useCurrentUserState } from '@/app/current-user-context'
import ndjokaLogo from '@/assets/ndjoka_logo.svg'
import { Button } from '@/components/ui/button'
const AdminUsersPage = lazy(() => import('@/features/admin/AdminUsersPage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const ExplorerPage = lazy(() => import('@/features/explorer/ExplorerPage'))
const ExplorerTontineDetailPage = lazy(() => import('@/features/explorer/ExplorerTontineDetailPage'))
const GuideDetailPage = lazy(() => import('@/features/explorer/GuideDetailPage'))
const NdjokaAIPage = lazy(() => import('@/features/ai/NdjokaAIPage'))
const PaymentsPage = lazy(() => import('@/features/payments/PaymentsPage'))
const PaymentHistoryPage = lazy(() => import('@/features/payments/PaymentHistoryPage'))
const PaymentDetailPage = lazy(() => import('@/features/payments/PaymentDetailPage'))
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'))
const TontinesPage = lazy(() => import('@/features/tontines/TontinesPage'))
const CreateTontinePage = lazy(() => import('@/features/tontines/CreateTontinePage'))
const TontineWorkspace = lazy(() => import('@/features/tontines/TontineWorkspace'))
const TurnDetailPage = lazy(() => import('@/features/tontines/TurnDetailPage'))

function Brand() {
  return <img src={ndjokaLogo} alt="Ndjoka" className="h-14 w-auto object-contain" />
}

function LoginScreen() {
  const { error, isLoading, loginWithRedirect } = useAuth0()
  const location = useLocation()

  const handleLogin = () => {
    void loginWithRedirect({
      appState: { returnTo: location.pathname + location.search },
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_10%_10%,#dcfce7_0,transparent_35%),#f7faf7] p-7">
      <section className="w-full max-w-[480px] rounded-3xl border border-emerald-100 bg-white/95 p-10 text-center shadow-[0_24px_70px_rgba(22,101,52,0.1)] sm:p-14">
        <div className="flex justify-center">
          <Brand />
        </div>
        <p className="mt-8 text-[11px] font-bold tracking-[0.13em] text-primary uppercase">Espace membre</p>
        <h1 className="mt-2 text-[clamp(28px,6vw,40px)] leading-tight font-extrabold tracking-tight text-emerald-800">
          Votre épargne, en confiance.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-muted-foreground">
          Retrouvez vos tontines et suivez vos versements depuis un espace simple et sécurisé.
        </p>

        <div className="mt-7 border-t border-emerald-50 pt-6">
          {isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Vérification de votre session…
            </p>
          ) : error ? (
            <div className="space-y-4">
              <p role="alert" className="text-sm text-destructive">
                Authentification impossible : {error.message}
              </p>
              <Button onClick={handleLogin} size="lg">
                Réessayer <ArrowRight />
              </Button>
            </div>
          ) : (
            <Button onClick={handleLogin} size="lg">
              Accéder à mon espace <ArrowRight />
            </Button>
          )}
        </div>
      </section>
    </main>
  )
}

function CenteredStatus({ children }: { children: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-background p-6">{children}</main>
}

function LoadingScreen() {
  return (
    <CenteredStatus>
      <div className="flex flex-col items-center gap-3 text-muted-foreground" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p>Connexion à votre espace Ndjoka…</p>
      </div>
    </CenteredStatus>
  )
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <CenteredStatus>
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
        <Button variant="outline" onClick={onRetry}>
          Réessayer l’appel API
        </Button>
      </div>
    </CenteredStatus>
  )
}

function AdminRoute({ children }: { children: ReactNode }) {
  const profile = useCurrentUser()
  const isAdmin = ['support', 'platform_admin'].includes(profile.global_role)
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />
}

function AuthenticatedApp() {
  const { state, refresh } = useCurrentUserState()

  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <ErrorScreen message={state.message} onRetry={refresh} />

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/explorer/guides/:slug" element={<GuideDetailPage />} />
          <Route path="/explorer/:tontineId" element={<ExplorerTontineDetailPage />} />
          <Route path="/tontines" element={<TontinesPage />} />
          <Route path="/tontines/create" element={<CreateTontinePage />} />
          <Route path="/tontines/:tontineId" element={<TontineWorkspace />} />
          <Route path="/tontines/:tontineId/cycles/:cycleId/turns/:turnId" element={<TurnDetailPage />} />
          <Route path="/paiements" element={<PaymentsPage />} />
          <Route path="/paiements/historique" element={<PaymentHistoryPage />} />
          <Route path="/paiements/historique/:type/:operationId" element={<PaymentDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/ndjoka-ai" element={<NdjokaAIPage />} />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsersPage />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

function App() {
  const { isAuthenticated } = useAuth0()

  if (!isAuthenticated) return <LoginScreen />

  return (
    <CurrentUserProvider>
      <AuthenticatedApp />
    </CurrentUserProvider>
  )
}

export default App
