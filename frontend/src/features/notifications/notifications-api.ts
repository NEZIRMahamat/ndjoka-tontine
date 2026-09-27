import { apiRequest, isRecord } from '@/lib/http'

export type Notification = {
  id: string
  tontine_id: string | null
  event_name: string
  payload: Record<string, unknown>
  action_path: string | null
  status: 'unread' | 'read'
  read_at: string | null
  created_at: string
}

export type NotificationPage = {
  items: Notification[]
  next_cursor: string | null
  limit: number
}

function isNotification(value: unknown): value is Notification {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.tontine_id === null || typeof value.tontine_id === 'string') &&
    typeof value.event_name === 'string' &&
    isRecord(value.payload) &&
    (value.action_path === null || typeof value.action_path === 'string') &&
    (value.status === 'unread' || value.status === 'read') &&
    (value.read_at === null || typeof value.read_at === 'string') &&
    typeof value.created_at === 'string'
  )
}

function isNotificationPage(value: unknown): value is NotificationPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isNotification) &&
    (value.next_cursor === null || typeof value.next_cursor === 'string') &&
    typeof value.limit === 'number'
  )
}

export async function listNotifications(
  accessToken: string,
  signal?: AbortSignal,
): Promise<NotificationPage> {
  const payload = await apiRequest(accessToken, '/api/v1/me/notifications?limit=8', { signal })
  if (!isNotificationPage(payload)) throw new Error('La liste des notifications reçue est invalide')
  return payload
}

export async function getUnreadNotificationCount(
  accessToken: string,
  signal?: AbortSignal,
): Promise<number> {
  const payload = await apiRequest(accessToken, '/api/v1/me/notifications/unread-count', { signal })
  if (!isRecord(payload) || typeof payload.count !== 'number' || payload.count < 0) {
    throw new Error('Le nombre de notifications non lues reçu est invalide')
  }
  return payload.count
}

export async function markNotificationRead(accessToken: string, notificationId: string): Promise<Notification> {
  const payload = await apiRequest(
    accessToken,
    `/api/v1/me/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'POST' },
  )
  if (!isNotification(payload)) throw new Error('La notification reçue est invalide')
  return payload
}

export async function markAllNotificationsRead(accessToken: string): Promise<number> {
  const payload = await apiRequest(accessToken, '/api/v1/me/notifications/read-all', { method: 'POST' })
  if (!isRecord(payload) || typeof payload.updated !== 'number' || payload.updated < 0) {
    throw new Error('Le résultat de mise à jour des notifications reçu est invalide')
  }
  return payload.updated
}
