const decimalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

export function formatCurrencyAmount(amount: string | number, currency: string | null): string {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return currency ? `${amount} ${currency}` : String(amount)
  if (!currency) return decimalFormat.format(numeric)
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(numeric)
  } catch {
    return `${decimalFormat.format(numeric)} ${currency}`
  }
}
