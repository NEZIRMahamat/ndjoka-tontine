import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import { getCurrentUser, type CurrentUserResponse } from './api.ts'
import AdminUsersPage from './AdminUsersPage'
import DashboardPage from './DashboardPage'
import ndjokaLogo from './assets/ndjoka_logo.svg'
import ProfilePage from './ProfilePage'
import TontinesPage from './TontinesPage'

type ApiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; currentUser: CurrentUserResponse }
  | { status: 'error'; message: string }

type View = 'dashboard' | 'explore' | 'tontines' | 'payments' | 'profile' | 'admin'

const navigation: Array<{ id: View; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Accueil', icon: 'grid' },
  { id: 'explore', label: 'Explorer', icon: 'compass' },
  { id: 'tontines', label: 'Mes tontines', icon: 'users' },
  { id: 'payments', label: 'Paiements', icon: 'card' },
]

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    compass: 'm12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.87',
    card: 'M3 5h18v14H3zM3 10h18M7 15h3',
    user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    spark: 'm12 3-1.6 5.4L5 10l5.4 1.6L12 17l1.6-5.4L19 10l-5.4-1.6L12 3ZM5 17l-.7 2.3L2 20l2.3.7L5 23l.7-2.3L8 20l-2.3-.7L5 17Z',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    logout: 'M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-5',
    chevron: 'M9 18l6-6-6-6',
    shield: 'M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z',
  }

  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

function Brand() {
  return <div className="brand"><img src={ndjokaLogo} alt="Ndjoka" /></div>
}

function App() {
  const {
    error,
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout,
    user,
  } = useAuth0()
  const [apiState, setApiState] = useState<ApiState>({ status: 'idle' })
  const [apiRequestId, setApiRequestId] = useState(0)
  const [view, setView] = useState<View>('dashboard')
  const [profileOpen, setProfileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    let isActive = true
    const abortController = new AbortController()

    const loadCurrentUser = async () => {
      setApiState({ status: 'loading' })

      try {
        const accessToken = await getAccessTokenSilently()
        if (!isActive) return

        const currentUser = await getCurrentUser(
          accessToken,
          abortController.signal,
        )
        if (isActive) {
          setApiState({ status: 'success', currentUser })
        }
      } catch (caughtError) {
        if (
          !isActive ||
          (caughtError instanceof DOMException && caughtError.name === 'AbortError')
        ) {
          return
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "L'appel à l'API a échoué"
        setApiState({ status: 'error', message })
      }
    }

    void loadCurrentUser()

    return () => {
      isActive = false
      abortController.abort()
    }
  }, [apiRequestId, getAccessTokenSilently, isAuthenticated])

  const handleLogin = () => {
    void loginWithRedirect()
  }

  const handleLogout = () => {
    setApiState({ status: 'idle' })
    void logout({
      logoutParams: { returnTo: window.location.origin },
    })
  }

  const retryApiCall = () => {
    setApiRequestId((requestId) => requestId + 1)
  }

  const displayName =
    user?.name ?? user?.nickname ?? user?.email ?? 'Utilisateur Auth0'

  if (!isAuthenticated) {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="app-title">
          <Brand />
          <p className="eyebrow">Espace membre</p>
          <h1 id="app-title">Votre épargne, en confiance.</h1>
          <p className="intro">Retrouvez vos tontines et suivez vos versements depuis un espace simple et sécurisé.</p>

          {isLoading ? (
            <p className="status" role="status">Vérification de votre session…</p>
          ) : error ? (
            <>
              <p className="status status-error" role="alert">Authentification impossible : {error.message}</p>
              <div className="auth-panel">
                <button className="button" onClick={handleLogin} type="button">
                  Réessayer <Icon name="arrow" size={17} />
                </button>
              </div>
            </>
          ) : (
            <div className="auth-panel">
              <button className="button" onClick={handleLogin} type="button">
                Accéder à mon espace <Icon name="arrow" size={17} />
              </button>
            </div>
          )}
        </section>
      </main>
    )
  }

  const pageTitles: Record<View, string> = { dashboard: 'Tableau de bord', explore: 'Explorer', tontines: 'Mes tontines', payments: 'Paiements', profile: 'Mon profil', admin: 'Administration' }
  const profile = apiState.status === 'success' ? apiState.currentUser : null
  const visibleNavigation = profile && ['support', 'platform_admin'].includes(profile.global_role)
    ? [...navigation, { id: 'admin' as View, label: 'Administration', icon: 'shield' }]
    : navigation

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}><div className="sidebar-head"><Brand /><button className="sidebar-toggle" type="button" aria-label={sidebarCollapsed ? 'Déplier le menu' : 'Plier le menu'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? 'Déplier le menu' : 'Plier le menu'} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}><Icon name="chevron" /></button></div><nav className="side-nav" aria-label="Navigation principale">{visibleNavigation.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}<button className="nav-item nav-ai" onClick={() => setView('dashboard')}><Icon name="spark" /><span>Ndjoka AI</span><small>Bientôt</small></button></nav><div className="sidebar-bottom"><button className={`nav-item ${view === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}><Icon name="user" /><span>Mon profil</span></button><button className="nav-item logout" onClick={handleLogout}><Icon name="logout" /><span>Se déconnecter</span></button></div></aside>
      <main className="app-main"><header className="topbar"><div><span className="mobile-brand"><Brand /></span><span className="page-kicker">Espace membre</span><h1>{pageTitles[view]}</h1></div><div className="topbar-actions"><span className="environment-badge"><i /> API connectée</span><button className="icon-button" aria-label="Notifications"><Icon name="bell" /><i /></button><div className="profile-wrap"><button className="profile-trigger" onClick={() => setProfileOpen(!profileOpen)}><img src={profile?.avatar_url ?? user?.picture} alt="" /><span><strong>{profile?.display_name ?? displayName}</strong><small>{profile?.global_role.replace('_', ' ') ?? 'Connexion sécurisée'}</small></span><b>⌄</b></button>{profileOpen && <div className="profile-menu"><button onClick={() => { setView('profile'); setProfileOpen(false) }}><Icon name="user" /> Mon profil</button><button onClick={handleLogout}><Icon name="logout" /> Se déconnecter</button></div>}</div></div></header><div className="page-content">{apiState.status === 'loading' || apiState.status === 'idle' ? <section className="panel loading-panel" role="status">Connexion à votre espace Ndjoka…</section> : apiState.status === 'error' ? <section className="panel api-error"><p className="error-message">{apiState.message}</p><button className="button" onClick={retryApiCall}>Réessayer l’appel API</button></section> : view === 'dashboard' ? <DashboardPage profile={apiState.currentUser} onOpenTontines={() => setView('tontines')} /> : view === 'tontines' ? <TontinesPage key={user?.sub} profile={apiState.currentUser} /> : view === 'profile' ? <ProfilePage profile={apiState.currentUser} onUpdated={(currentUser) => setApiState({ status: 'success', currentUser })} /> : view === 'admin' ? <AdminUsersPage profile={apiState.currentUser} /> : <Placeholder view={view} onView={setView} />}</div></main>
    </div>
  )
}

function Placeholder({ view, onView }: { view: View; onView: (view: View) => void }) { const titles: Record<View, string> = { dashboard: 'Tableau de bord', explore: 'Explorer les tontines', tontines: 'Mes tontines', payments: 'Vos paiements', profile: 'Votre profil', admin: 'Administration' }; return <section className="empty-view"><span className="empty-icon"><Icon name={view === 'payments' ? 'card' : 'compass'} size={28} /></span><p className="page-kicker">Prochain sprint</p><h2>{titles[view]}</h2><p>Cette fonctionnalité est volontairement hors du périmètre actuel. Le socle utilisateurs, tontines et membres est déjà opérationnel.</p><button className="button" onClick={() => onView('dashboard')}>Retour au tableau de bord</button></section> }

export default App
