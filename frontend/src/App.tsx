import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import { getCurrentUser, type CurrentUserResponse } from './api.ts'

type ApiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; currentUser: CurrentUserResponse }
  | { status: 'error'; message: string }

type View = 'dashboard' | 'explore' | 'tontines' | 'payments' | 'profile'

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
  }

  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

function Brand() {
  return <div className="brand"><span className="brand-mark">N</span><span><strong>Ndjoka</strong><small>TONTINE DIGITALE</small></span></div>
}

const formatName = (value?: string) => value?.split(' ')[0] || value || 'membre'

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

  const pageTitles: Record<View, string> = { dashboard: 'Tableau de bord', explore: 'Explorer', tontines: 'Mes tontines', payments: 'Paiements', profile: 'Mon profil' }
  const firstName = formatName(user?.given_name ?? user?.name ?? user?.nickname)

  return (
    <div className="app-shell">
      <aside className="sidebar"><Brand /><nav className="side-nav" aria-label="Navigation principale">{navigation.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}<button className="nav-item nav-ai" onClick={() => setView('dashboard')}><Icon name="spark" /><span>Ndjoka AI</span><small>Bientôt</small></button></nav><div className="sidebar-bottom"><button className="nav-item" onClick={() => setView('profile')}><Icon name="user" /><span>Mon profil</span></button><button className="nav-item logout" onClick={handleLogout}><Icon name="logout" /><span>Se déconnecter</span></button></div></aside>
      <main className="app-main"><header className="topbar"><div><span className="mobile-brand"><Brand /></span><span className="page-kicker">Espace membre</span><h1>{pageTitles[view]}</h1></div><div className="topbar-actions"><button className="icon-button" aria-label="Notifications"><Icon name="bell" /><i /></button><div className="profile-wrap"><button className="profile-trigger" onClick={() => setProfileOpen(!profileOpen)}><img src={user?.picture} alt="" /><span><strong>{displayName}</strong><small>Membre vérifié</small></span><b>⌄</b></button>{profileOpen && <div className="profile-menu"><button onClick={() => { setView('profile'); setProfileOpen(false) }}><Icon name="user" /> Mon profil</button><button onClick={handleLogout}><Icon name="logout" /> Se déconnecter</button></div>}</div></div></header><div className="page-content">{view === 'dashboard' ? <Dashboard firstName={firstName} apiState={apiState} retryApiCall={retryApiCall} onView={setView} /> : <Placeholder view={view} onView={setView} />}</div></main>
    </div>
  )
}

function Dashboard({ firstName, apiState, retryApiCall, onView }: { firstName: string; apiState: ApiState; retryApiCall: () => void; onView: (view: View) => void }) {
  return <div className="dashboard"><div className="welcome-row"><div><p className="page-kicker">Votre aperçu financier</p><h2>Bonjour, {firstName} <span aria-hidden="true">👋</span></h2><p>Voici ce qui se passe dans vos tontines aujourd'hui.</p></div><button className="button" onClick={() => onView('payments')}><Icon name="card" size={17} /> Nouveau versement</button></div>{apiState.status === 'error' && <div className="api-notice"><span>Mode aperçu activé : les données de tontine seront bientôt reliées à votre compte.</span><button onClick={retryApiCall}>Réessayer</button></div>}<section className="stats-grid"><Stat title="Épargne totale" value="2 450 €" detail="+12% depuis le mois dernier" tone="blue" icon="card" /><Stat title="Prochain gain" value="500 €" detail="Prévu le 15 novembre" tone="green" icon="arrow" /><Stat title="Score de fiabilité" value="98 / 100" detail="Excellent profil" tone="purple" icon="spark" /></section><div className="content-grid"><section className="panel chart-panel"><div className="panel-heading"><div><p className="page-kicker">Évolution</p><h3>Votre épargne</h3></div><select aria-label="Période"><option>Cette année</option><option>6 derniers mois</option></select></div><div className="chart"><div className="chart-labels"><span>800 €</span><span>600 €</span><span>400 €</span><span>200 €</span><span>0 €</span></div><div className="chart-area"><div className="chart-line" /><div className="chart-points"><i /><i /><i /><i /><i /><i /><i /></div><div className="chart-months"><span>Jan</span><span>Fév</span><span>Mar</span><span>Avr</span><span>Mai</span><span>Juin</span><span>Juil</span></div></div></div></section><section className="panel tontine-panel"><div className="panel-heading"><h3>Tontines en cours</h3><button className="text-button" onClick={() => onView('tontines')}>Voir tout <Icon name="arrow" size={14} /></button></div><Tontine name="Famille Diop" role="Participant" amount="100 €" date="05 nov." progress={65} /><Tontine name="Business Femmes Paris" role="Administratrice" amount="200 €" date="12 nov." progress={30} /><div className="reminder"><strong>Rappel important</strong><p>Votre premier versement pour « Voyage Dubai » est prévu dans 3 jours.</p></div></section></div></div>
}

function Stat({ title, value, detail, tone, icon }: { title: string; value: string; detail: string; tone: string; icon: string }) { return <article className="stat-card"><div><p>{title}</p><strong>{value}</strong><small className={tone === 'green' ? 'positive' : ''}>{detail}</small></div><span className={`stat-icon ${tone}`}><Icon name={icon} /></span></article> }
function Tontine({ name, role, amount, date, progress }: { name: string; role: string; amount: string; date: string; progress: number }) { return <article className="tontine-item"><div className="tontine-top"><div><h4>{name}</h4><span>{role}</span></div><strong>{amount}<small>/ mois</small></strong></div><div className="progress-meta"><span>Progression</span><b>{progress}%</b></div><div className="progress"><i style={{ width: `${progress}%` }} /></div><p><Icon name="card" size={14} /> Prochain versement : <b>{date}</b></p></article> }
function Placeholder({ view, onView }: { view: View; onView: (view: View) => void }) { const titles: Record<View, string> = { dashboard: 'Tableau de bord', explore: 'Explorer les tontines', tontines: 'Mes tontines', payments: 'Vos paiements', profile: 'Votre profil' }; return <section className="empty-view"><span className="empty-icon"><Icon name={view === 'payments' ? 'card' : view === 'profile' ? 'user' : view === 'explore' ? 'compass' : 'users'} size={28} /></span><p className="page-kicker">Espace membre</p><h2>{titles[view]}</h2><p>Cette section est prête pour accueillir les fonctionnalités de votre espace client.</p>{view !== 'dashboard' && <button className="button" onClick={() => onView('dashboard')}>Retour au tableau de bord</button>}</section> }

export default App
