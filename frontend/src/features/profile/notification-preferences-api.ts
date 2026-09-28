import { apiRequest, isRecord } from '@/lib/http'

export type NotificationPreferences = {
  channel_email: boolean
  channel_sms: boolean
  channel_push: boolean
  payment_reminders: boolean
  payments_received: boolean
  late_payments: boolean
  payouts: boolean
  new_members: boolean
  newsletter: boolean
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  channel_email: true,
  channel_sms: false,
  channel_push: false,
  payment_reminders: true,
  payments_received: true,
  late_payments: true,
  payouts: true,
  new_members: false,
  newsletter: false,
}

function isPreferences(value: unknown): value is NotificationPreferences {
  return isRecord(value) && Object.keys(DEFAULT_PREFERENCES).every((key) => typeof value[key] === 'boolean')
}

export async function getNotificationPreferences(token: string, signal?: AbortSignal): Promise<NotificationPreferences> {
  const payload = await apiRequest(token, '/api/v1/me/notification-preferences', { signal })
  if (!isPreferences(payload)) throw new Error('Les préférences reçues sont invalides')
  return payload
}

export async function saveNotificationPreferences(token: string, preferences: NotificationPreferences): Promise<NotificationPreferences> {
  const payload = await apiRequest(token, '/api/v1/me/notification-preferences', { method: 'PUT', body: JSON.stringify(preferences) })
  if (!isPreferences(payload)) throw new Error('Les préférences reçues sont invalides')
  return payload
}
