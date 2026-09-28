import { apiRequest, isRecord } from '@/lib/http'

export type PaymentMethodType = 'card' | 'sepa' | 'mobile_money'

export type PaymentMethod = {
  id: string
  type: PaymentMethodType
  label: string
  last4: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  card: 'Carte bancaire',
  sepa: 'Prélèvement SEPA',
  mobile_money: 'Mobile Money',
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return isRecord(value) && typeof value.id === 'string' &&
    ['card', 'sepa', 'mobile_money'].includes(String(value.type)) &&
    typeof value.label === 'string' && typeof value.last4 === 'string' &&
    typeof value.is_default === 'boolean'
}

export async function listPaymentMethods(token: string, signal?: AbortSignal): Promise<PaymentMethod[]> {
  const payload = await apiRequest(token, '/api/v1/me/payment-methods', { signal })
  if (!isRecord(payload) || !Array.isArray(payload.items) || !payload.items.every(isPaymentMethod)) {
    throw new Error('La liste des moyens de paiement reçue est invalide')
  }
  return payload.items
}

export async function addPaymentMethod(
  token: string,
  input: { type: PaymentMethodType; label: string; identifier: string; make_default?: boolean },
): Promise<PaymentMethod> {
  const payload = await apiRequest(token, '/api/v1/me/payment-methods', { method: 'POST', body: JSON.stringify(input) })
  if (!isPaymentMethod(payload)) throw new Error('Le moyen de paiement reçu est invalide')
  return payload
}

export async function setDefaultPaymentMethod(token: string, id: string): Promise<PaymentMethod> {
  const payload = await apiRequest(token, `/api/v1/me/payment-methods/${encodeURIComponent(id)}/default`, { method: 'POST' })
  if (!isPaymentMethod(payload)) throw new Error('Le moyen de paiement reçu est invalide')
  return payload
}

export async function removePaymentMethod(token: string, id: string): Promise<void> {
  await apiRequest(token, `/api/v1/me/payment-methods/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
