export type Auth0Config = {
  domain: string
  clientId: string
  audience: string
}

type Auth0ConfigResult =
  | { ok: true; config: Auth0Config }
  | { ok: false; missingVariables: string[] }

export function getAuth0Config(): Auth0ConfigResult {
  const domain = (import.meta.env.VITE_AUTH0_DOMAIN ?? '').trim()
  const clientId = (import.meta.env.VITE_AUTH0_CLIENT_ID ?? '').trim()
  const audience = (import.meta.env.VITE_AUTH0_AUDIENCE ?? '').trim()
  const missingVariables: string[] = []

  if (!domain) missingVariables.push('VITE_AUTH0_DOMAIN')
  if (!clientId) missingVariables.push('VITE_AUTH0_CLIENT_ID')
  if (!audience) missingVariables.push('VITE_AUTH0_AUDIENCE')

  if (missingVariables.length > 0) {
    return { ok: false, missingVariables }
  }

  return {
    ok: true,
    config: { domain, clientId, audience },
  }
}
