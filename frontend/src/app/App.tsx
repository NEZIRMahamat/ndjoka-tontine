import { lazy, Suspense, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { AlertTriangle, ArrowRight, Loader2, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AppLayout } from '@/app/AppLayout'
import { CurrentUserProvider, useCurrentUser, useCurrentUserState } from '@/app/current-user-context'
import { NdjokaLogoFull } from '@/components/brand/NdjokaLogo'
import { Toaster } from '@/components/ui/sonner'
import LegalPage, { type LegalDocument } from '@/features/legal/LegalPage'

const AdminUsersPage = lazy(() => import('@/features/admin/AdminUsersPage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const ExplorePage = lazy(() => import('@/features/explorer/ExplorePage'))
const ExploreTontineDetailPage = lazy(() => import('@/features/explorer/ExploreTontineDetailPage'))
const GuideDetailPage = lazy(() => import('@/features/explorer/GuideDetailPage'))
const NdjokaAIPage = lazy(() => import('@/features/ai/NdjokaAIPage'))
const PaymentsPage = lazy(() => import('@/features/payments/PaymentsPage'))
const TransactionHistoryPage = lazy(() => import('@/features/payments/TransactionHistoryPage'))
const TransactionDetailPage = lazy(() => import('@/features/payments/TransactionDetailPage'))
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'))
const PersonalInfoPage = lazy(() => import('@/features/profile/PersonalInfoPage'))
const PaymentMethodsPage = lazy(() => import('@/features/profile/PaymentMethodsPage'))
const SecurityPage = lazy(() => import('@/features/profile/SecurityPage'))
const NotificationSettingsPage = lazy(() => import('@/features/profile/NotificationSettingsPage'))
const SaverProfilePage = lazy(() => import('@/features/profile/SaverProfilePage'))
const PublicProfilePage = lazy(() => import('@/features/profile/PublicProfilePage'))
const MyTontinesPage = lazy(() => import('@/features/tontines/MyTontinesPage'))
const CreateTontinePage = lazy(() => import('@/features/tontines/CreateTontinePage'))
const TontineDetailPage = lazy(() => import('@/features/tontines/TontineDetailPage'))
const TontineWorkspace = lazy(() => import('@/features/tontines/TontineWorkspace'))
const TurnDetailPage = lazy(() => import('@/features/tontines/TurnDetailPage'))
const FeesPage = lazy(() => import('@/features/fees/FeesPage'))

const LEGAL_ROUTES: Array<{ path: string; document: LegalDocument }> = [
  { path: '/cgu', document: 'cgu' },
  { path: '/confidentialite', document: 'confidentialite' },
  { path: '/a-propos', document: 'a-propos' },
  { path: '/equipe', document: 'equipe' },
]

function LoginScreen() {
  const { error, isLoading, loginWithRedirect } = useAuth0()
  const location = useLocation()

  const handleLogin = (screenHint?: 'signup') => {
    void loginWithRedirect({
      appState: { returnTo: location.pathname + location.search },
      ...(screenHint ? { authorizationParams: { screen_hint: screenHint } } : {}),
    })
  }

  const highlights = [
    { icon: Users, title: 'Rejoignez ou créez une tontine', text: 'Des groupes ouverts classés selon votre profil, ou votre cercle sur invitation.' },
    { icon: ShieldCheck, title: 'Chaque cotisation est tracée', text: 'Déclaration, confirmation, versement du pot : un historique impossible à effacer.' },
    { icon: Sparkles, title: 'Ndjoka AI vous accompagne', text: 'Un assistant qui répond à partir de vos données et vous oriente.' },
  ]

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#d1fae5_0,transparent_35%),radial-gradient(circle_at_90%_90%,#ccfbf1_0,transparent_30%),#f8fafc]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <NdjokaLogoFull className="h-12 w-auto" />
          <nav className="hidden items-center gap-5 text-sm font-medium text-slate-500 sm:flex">
            <Link to="/a-propos" className="hover:text-emerald-700">À propos</Link>
            <Link to="/equipe" className="hover:text-emerald-700">L'équipe</Link>
            <Link to="/cgu" className="hover:text-emerald-700">CGU</Link>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold tracking-[0.15em] text-emerald-600 uppercase">Tontine digitale</p>
            <h1 className="mt-3 text-[clamp(32px,5vw,52px)] leading-[1.05] font-extrabold tracking-tight text-slate-900">
              Votre épargne, <span className="text-emerald-600">en confiance.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-slate-600">
              Ndjoka rend la tontine aussi sûre qu'un service financier moderne, sans perdre la solidarité qui fait sa force.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {isLoading ? (
                <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Vérification de votre session…
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleLogin()}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 transition-colors hover:bg-emerald-700"
                  >
                    Accéder à mon espace <ArrowRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLogin('signup')}
                    className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                  >
                    Créer un compte
                  </button>
                </>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle size={15} /> Authentification impossible : {error.message}
              </p>
            )}
            <p className="mt-6 text-xs text-slate-400">
              En continuant, vous acceptez nos <Link to="/cgu" className="underline underline-offset-2 hover:text-slate-600">conditions d'utilisation</Link> et notre{' '}
              <Link to="/confidentialite" className="underline underline-offset-2 hover:text-slate-600">politique de confidentialité</Link>.
            </p>
          </div>

          <div className="space-y-4">
            {highlights.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-4 rounded-2xl border border-emerald-100 bg-white/90 p-5 shadow-[0_18px_50px_rgba(22,101,52,0.08)]">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Icon size={20} /></span>
                <div>
                  <p className="font-bold text-slate-800">{title}</p>
                  <p className="mt-1 text-sm text-slate-500">{text}</p>
                </div>
              </div>
            ))}
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950 p-5 text-white">
              <p className="text-xs font-bold tracking-widest text-emerald-300 uppercase">Frais transparents</p>
              <p className="mt-2 text-sm text-white/80">
                Une commission dégressive de 3 % à 1 %, plafonnée à 10 € par cotisation, déduite du pot. Un sixième alimente le fonds de solidarité.
              </p>
              <Link to="/frais" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-300 hover:text-white">
                Voir le barème <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-400 sm:flex-row">
          <span>© {new Date().getFullYear()} Ndjoka SAS</span>
          <div className="flex flex-wrap gap-4">
            <Link to="/cgu" className="hover:text-slate-600">CGU</Link>
            <Link to="/confidentialite" className="hover:text-slate-600">Confidentialité</Link>
            <Link to="/a-propos" className="hover:text-slate-600">À propos</Link>
            <Link to="/equipe" className="hover:text-slate-600">L'équipe</Link>
            <Link to="/frais" className="hover:text-slate-600">Nos frais</Link>
          </div>
        </footer>
      </div>
    </main>
  )
}

function PublicPage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto mb-6 flex max-w-3xl items-center justify-between">
        <Link to="/" aria-label="Accueil"><NdjokaLogoFull className="h-9 w-auto" /></Link>
        <Link to="/" className="text-sm font-semibold text-emerald-700 hover:underline">Se connecter</Link>
      </div>
      {children}
    </main>
  )
}

function CenteredStatus({ children }: { children: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">{children}</main>
}

function LoadingScreen() {
  return (
    <CenteredStatus>
      <div className="flex flex-col items-center gap-3 text-slate-500" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <p>Connexion à votre espace Ndjoka…</p>
      </div>
    </CenteredStatus>
  )
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <CenteredStatus>
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p role="alert" className="text-sm text-red-600">{message}</p>
        <button type="button" onClick={onRetry} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Réessayer
        </button>
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
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/explore/:tontineId" element={<ExploreTontineDetailPage />} />
          <Route path="/guides/:slug" element={<GuideDetailPage />} />
          <Route path="/tontines" element={<MyTontinesPage />} />
          <Route path="/tontines/create" element={<CreateTontinePage />} />
          <Route path="/tontines/:tontineId" element={<TontineDetailPage />} />
          <Route path="/tontines/:tontineId/gestion" element={<TontineWorkspace />} />
          <Route path="/tontines/:tontineId/tour/:turnId" element={<TurnDetailPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/payments/history" element={<TransactionHistoryPage />} />
          <Route path="/payments/history/:type/:operationId" element={<TransactionDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/info" element={<PersonalInfoPage />} />
          <Route path="/profile/savings" element={<SaverProfilePage />} />
          <Route path="/profile/payment-methods" element={<PaymentMethodsPage />} />
          <Route path="/profile/security" element={<SecurityPage />} />
          <Route path="/profile/notifications" element={<NotificationSettingsPage />} />
          <Route path="/members/:userId" element={<PublicProfilePage />} />
          <Route path="/ndjoka-ai" element={<NdjokaAIPage />} />
          <Route path="/frais" element={<FeesPage />} />
          {LEGAL_ROUTES.map((route) => (
            <Route key={route.path} path={route.path} element={<LegalPage document={route.document} />} />
          ))}
          <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
          {/* Anciennes URL */}
          <Route path="/explorer" element={<Navigate to="/explore" replace />} />
          <Route path="/paiements" element={<Navigate to="/payments" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

function App() {
  const { isAuthenticated } = useAuth0()

  if (!isAuthenticated) {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            {LEGAL_ROUTES.map((route) => (
              <Route key={route.path} path={route.path} element={<PublicPage><LegalPage document={route.document} standalone /></PublicPage>} />
            ))}
            <Route path="/frais" element={<PublicPage><FeesPage standalone /></PublicPage>} />
            <Route path="*" element={<LoginScreen />} />
          </Routes>
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </>
    )
  }

  return (
    <CurrentUserProvider>
      <AuthenticatedApp />
    </CurrentUserProvider>
  )
}

export default App
