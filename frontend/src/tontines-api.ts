import { getApiBaseUrl } from './api'

export type Tontine = {
  id: string
  name: string
  description: string | null
  currency: string
  max_members: number | null
  status: 'draft' | 'active' | 'archived'
  created_by_user_id: string
  created_at: string
  updated_at: string
  archived_at: string | null
}
export type TontineInput = Pick<Tontine, 'name' | 'description' | 'currency' | 'max_members'>
export type TontinePage = { items: Tontine[]; total: number; limit: number; offset: number }

function isTontine(value: unknown): value is Tontine {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' &&
    typeof item.currency === 'string' && typeof item.created_by_user_id === 'string' &&
    typeof item.created_at === 'string' && typeof item.updated_at === 'string' &&
    (item.description === null || typeof item.description === 'string') &&
    (item.max_members === null || Number.isInteger(item.max_members)) &&
    (item.archived_at === null || typeof item.archived_at === 'string') &&
    ['draft', 'active', 'archived'].includes(String(item.status))
}

async function request(token: string, path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/tontines${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'detail' in payload ? payload.detail : null
    const message = typeof detail === 'string' ? detail :
      Array.isArray(detail) ? detail.map((error: { msg?: string }) => error.msg ?? 'Champ invalide').join(' ; ') :
      `Impossible de traiter la demande (${response.status})`
    throw new Error(message)
  }
  return payload
}

export async function listTontines(token: string, offset: number, signal?: AbortSignal): Promise<TontinePage> {
  const payload = await request(token, `?limit=20&offset=${offset}`, { signal })
  if (!payload || typeof payload !== 'object' || !('items' in payload) || !Array.isArray(payload.items) ||
      !payload.items.every(isTontine) || !('total' in payload) || typeof payload.total !== 'number' ||
      !('limit' in payload) || typeof payload.limit !== 'number' || !('offset' in payload) || typeof payload.offset !== 'number') {
    throw new Error('La liste reçue est invalide')
  }
  return payload as TontinePage
}

export async function createTontine(token: string, input: TontineInput): Promise<Tontine> {
  const payload = await request(token, '', { method: 'POST', body: JSON.stringify(input) })
  if (!isTontine(payload)) throw new Error('La tontine reçue est invalide')
  return payload
}
