import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from '@/app/App.tsx'
import Auth0ProviderWithNavigate from '@/app/Auth0ProviderWithNavigate.tsx'
import { getAuth0Config } from '@/app/auth0-config.ts'
import './index.css'

const auth0 = getAuth0Config()
const environmentFile = import.meta.env.MODE === 'prod' ? '.env.prod' : '.env.dev'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {auth0.ok ? (
      <BrowserRouter>
        <Auth0ProviderWithNavigate config={auth0.config}>
          <App />
        </Auth0ProviderWithNavigate>
      </BrowserRouter>
    ) : (
      <main className="flex min-h-screen items-center justify-center bg-muted p-7">
        <section className="w-full max-w-[520px] rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
          <p className="text-xs font-bold tracking-[0.13em] text-primary uppercase">Configuration locale</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Auth0 doit être configuré</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Renseignez les variables suivantes dans le fichier <code>{environmentFile}</code>, puis relancez Vite.
          </p>
          <ul className="mt-5 space-y-2">
            {auth0.missingVariables.map((variable) => (
              <li key={variable}>
                <code className="rounded bg-muted px-2 py-1 text-xs">{variable}</code>
              </li>
            ))}
          </ul>
        </section>
      </main>
    )}
  </StrictMode>,
)
