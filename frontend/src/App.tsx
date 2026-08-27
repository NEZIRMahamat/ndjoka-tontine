import { useAuth0 } from '@auth0/auth0-react'

function App() {
  const {
    error,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout,
    user,
  } = useAuth0()

  const handleLogin = () => {
    void loginWithRedirect()
  }

  const handleLogout = () => {
    void logout({
      logoutParams: { returnTo: window.location.origin },
    })
  }

  const displayName =
    user?.name ?? user?.nickname ?? user?.email ?? 'Utilisateur Auth0'

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="app-title">
        <p className="eyebrow">Tontine digitale</p>
        <h1 id="app-title">Ndjoka Tontine</h1>
        <p className="intro">
          Une authentification simple et sécurisée avec Auth0.
        </p>

        {isLoading ? (
          <p className="status" role="status">
            Vérification de votre session…
          </p>
        ) : error ? (
          <p className="status status-error" role="alert">
            Authentification impossible : {error.message}
          </p>
        ) : isAuthenticated ? (
          <div className="auth-panel">
            <p className="status-label">Vous êtes connecté</p>
            <strong className="user-name">{displayName}</strong>
            {user?.email && user.email !== displayName ? (
              <span className="user-email">{user.email}</span>
            ) : null}
            <button
              className="button button-secondary"
              onClick={handleLogout}
              type="button"
            >
              Se déconnecter
            </button>
          </div>
        ) : (
          <div className="auth-panel">
            <p>Connectez-vous pour accéder à votre espace tontine.</p>
            <button className="button" onClick={handleLogin} type="button">
              Se connecter
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
