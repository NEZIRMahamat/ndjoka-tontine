import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'

import App from './App.tsx'
import { getAuth0Config } from './auth0-config.ts'
import './index.css'

const auth0 = getAuth0Config()
const environmentFile = import.meta.env.MODE === 'prod' ? '.env.prod' : '.env.dev'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {auth0.ok ? (
      <Auth0Provider
        domain={auth0.config.domain}
        clientId={auth0.config.clientId}
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience: auth0.config.audience,
          scope: 'openid profile email',
        }}
      >
        <App />
      </Auth0Provider>
    ) : (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="configuration-title">
          <p className="eyebrow">Configuration locale</p>
          <h1 id="configuration-title">Auth0 doit être configuré</h1>
          <p className="intro">
            Renseignez les variables suivantes dans le fichier{' '}
            <code>{environmentFile}</code>, puis relancez Vite.
          </p>
          <ul className="configuration-list">
            {auth0.missingVariables.map((variable) => (
              <li key={variable}>
                <code>{variable}</code>
              </li>
            ))}
          </ul>
        </section>
      </main>
    )}
  </StrictMode>,
)
