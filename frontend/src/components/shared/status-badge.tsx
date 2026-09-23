import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const toneClasses: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  neutral: 'border-transparent bg-muted text-muted-foreground',
}

const statusTones: Record<string, Tone> = {
  draft: 'warning',
  active: 'success',
  archived: 'neutral',
  pending: 'warning',
  accepted: 'success',
  revoked: 'neutral',
  expired: 'neutral',
  left: 'neutral',
  removed: 'neutral',
  scheduled: 'info',
  completed: 'success',
  cancelled: 'danger',
  declared: 'info',
  confirmed: 'success',
  rejected: 'danger',
  late: 'danger',
  ready: 'info',
  approved: 'info',
  declared_paid: 'warning',
  received: 'success',
  disputed: 'danger',
  suspended: 'danger',
  deactivated: 'neutral',
  unread: 'info',
  read: 'neutral',
}

const labels: Record<string, string> = {
  draft: 'Brouillon',
  active: 'Active',
  archived: 'Archivée',
  pending: 'En attente',
  accepted: 'Acceptée',
  revoked: 'Révoquée',
  expired: 'Expirée',
  left: 'Quitté',
  removed: 'Retiré',
  scheduled: 'Planifié',
  completed: 'Terminé',
  cancelled: 'Annulé',
  declared: 'Déclarée',
  confirmed: 'Confirmée',
  rejected: 'Rejetée',
  late: 'En retard',
  ready: 'Prêt',
  approved: 'Approuvé',
  declared_paid: 'Payé (déclaré)',
  received: 'Reçu',
  disputed: 'Contesté',
  suspended: 'Suspendu',
  deactivated: 'Désactivé',
  unread: 'Non lue',
  read: 'Lue',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = statusTones[status] ?? 'neutral'
  return (
    <Badge variant="outline" className={cn('font-medium', toneClasses[tone])}>
      {label ?? labels[status] ?? status}
    </Badge>
  )
}
