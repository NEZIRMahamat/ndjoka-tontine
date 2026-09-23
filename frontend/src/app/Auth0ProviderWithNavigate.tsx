import type { ReactNode } from 'react'
import { Auth0Provider, type AppState } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'

import type { Auth0Config } from '@/app/auth0-config.ts'

export default function Auth0ProviderWithNavigate({
  config,
  children,
}: {
  config: Auth0Config
  children: ReactNode
}) {
  const navigate = useNavigate()

  const onRedirectCallback = (appState?: AppState) => {
    navigate(appState?.returnTo ?? window.location.pathname, { replace: true })
  }

  return (
    <Auth0Provider
      domain={config.domain}
      clientId={config.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: config.audience,
        scope: 'openid profile email',
      }}
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  )
}
