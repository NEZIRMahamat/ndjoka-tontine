import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import { getCurrentUser, type CurrentUserResponse } from '@/features/profile/profile-api'

export type CurrentUserState =
  | { status: 'loading' }
  | { status: 'success'; profile: CurrentUserResponse }
  | { status: 'error'; message: string }

type CurrentUserContextValue = {
  state: CurrentUserState
  refresh: () => void
  setProfile: (profile: CurrentUserResponse) => void
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null)

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [state, setState] = useState<CurrentUserState>({ status: 'loading' })
  const [requestId, setRequestId] = useState(0)

  useEffect(() => {
    if (!isAuthenticated) return

    let active = true
    const controller = new AbortController()
    setState({ status: 'loading' })

    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        if (!active) return
        const profile = await getCurrentUser(token, controller.signal)
        if (active) setState({ status: 'success', profile })
      } catch (caught) {
        if (!active || (caught instanceof DOMException && caught.name === 'AbortError')) return
        const message = caught instanceof Error ? caught.message : "L'appel à l'API a échoué"
        setState({ status: 'error', message })
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, isAuthenticated, requestId])

  const value: CurrentUserContextValue = {
    state,
    refresh: () => setRequestId((requestValue) => requestValue + 1),
    setProfile: (profile) => setState({ status: 'success', profile }),
  }

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
}

export function useCurrentUserState(): CurrentUserContextValue {
  const context = useContext(CurrentUserContext)
  if (!context) throw new Error('useCurrentUserState doit être utilisé dans CurrentUserProvider')
  return context
}

export function useCurrentUser(): CurrentUserResponse {
  const { state } = useCurrentUserState()
  if (state.status !== 'success') {
    throw new Error('useCurrentUser appelé avant le chargement du profil')
  }
  return state.profile
}
