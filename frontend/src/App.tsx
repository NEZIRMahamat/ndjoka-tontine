import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import { getCurrentUser, type CurrentUserResponse } from './api.ts'

type ApiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; currentUser: CurrentUserResponse }
  | { status: 'error'; message: string }

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
            {apiState.status === 'loading' ? (
              <p className="api-status" role="status">
                Vérification de l’Access Token auprès de FastAPI…
              </p>
            ) : apiState.status === 'success' ? (
              <div className="api-result" role="status">
                <span className="api-badge">API protégée accessible</span>
                <span>
                  Identifiant : <code>{apiState.currentUser.sub}</code>
                </span>
                <span>
                  Permissions :{' '}
                  {apiState.currentUser.permissions.length > 0
                    ? apiState.currentUser.permissions.join(', ')
                    : 'aucune permission explicite'}
                </span>
              </div>
            ) : apiState.status === 'error' ? (
              <div className="api-result api-result-error" role="alert">
                <span>Appel FastAPI impossible : {apiState.message}</span>
                <button
                  className="button button-secondary button-compact"
                  onClick={retryApiCall}
                  type="button"
                >
                  Réessayer
                </button>
              </div>
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
