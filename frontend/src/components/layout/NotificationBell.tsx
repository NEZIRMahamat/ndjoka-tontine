import { useCallback, useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Bell, CheckCheck, Clock3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '@/features/notifications/notifications-api'
import { messageOf } from '@/lib/http'

const eventTitles: Record<string, string> = {
  'invitation.created': 'Nouvelle invitation',
  'membership.role_changed': 'Rôle mis à jour',
  'cycle.activated': 'Cycle activé',
  'cycle.cancelled': 'Cycle annulé',
  'contribution.due_soon': 'Cotisation à venir',
  'contribution.rejected': 'Déclaration à corriger',
  'payout.declared_paid': 'Versement déclaré',
  'payout.disputed': 'Versement contesté',
}

function internalPath(actionPath: string | null): string | null {
  if (!actionPath || !actionPath.startsWith('/') || actionPath.startsWith('//')) return null
  try {
    const url = new URL(actionPath, window.location.origin)
    if (url.origin !== window.location.origin) return null
    if (url.pathname === '/invitations') return '/tontines'
    const tontineAction = /^\/tontines\/([0-9a-f-]{36})\/(members|contributions|cycles(?:\/[0-9a-f-]{36})?|payouts\/[0-9a-f-]{36})$/i.exec(url.pathname)
    if (tontineAction) {
      const tab = tontineAction[2].startsWith('payouts') ? 'payouts'
        : tontineAction[2] === 'members' ? 'members' : 'cycles'
      return `/tontines/${tontineAction[1]}?tab=${tab}`
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date inconnue'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function NotificationBell() {
  const { getAccessTokenSilently } = useAuth0()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      const page = await listNotifications(token)
      setNotifications(page.items)
      setUnreadCount((count) => count ?? page.items.filter((item) => item.status === 'unread').length)
    } catch (caught) {
      setError(messageOf(caught, 'Impossible de charger vos notifications.'))
    } finally {
      setLoading(false)
    }
  }, [getAccessTokenSilently])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const refreshCount = async () => {
      try {
        const token = await getAccessTokenSilently()
        const count = await getUnreadNotificationCount(token, controller.signal)
        if (active) {
          setUnreadCount(count)
          setError('')
        }
      } catch (caught) {
        if (!active || (caught instanceof DOMException && caught.name === 'AbortError')) return
        setError(messageOf(caught, 'Impossible de vérifier vos notifications.'))
      }
    }
    void refreshCount()
    const interval = window.setInterval(() => void refreshCount(), 60_000)
    return () => {
      active = false
      controller.abort()
      window.clearInterval(interval)
    }
  }, [getAccessTokenSilently])

  async function openNotification(notification: Notification) {
    if (notification.status === 'unread') {
      setBusyId(notification.id)
      try {
        const token = await getAccessTokenSilently()
        const updated = await markNotificationRead(token, notification.id)
        setNotifications((items) => items.map((item) => item.id === updated.id ? updated : item))
        setUnreadCount((count) => count === null ? 0 : Math.max(0, count - 1))
      } catch (caught) {
        toast.error(messageOf(caught, 'Impossible de marquer cette notification comme lue.'))
        setBusyId('')
        return
      } finally {
        setBusyId('')
      }
    }
    const path = internalPath(notification.action_path)
    setOpen(false)
    if (path) navigate(path)
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      const token = await getAccessTokenSilently()
      await markAllNotificationsRead(token)
      setNotifications((items) => items.map((item) => ({ ...item, status: 'read' })))
      setUnreadCount(0)
    } catch (caught) {
      toast.error(messageOf(caught, 'Impossible de mettre à jour les notifications.'))
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void load()
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount ? `Notifications, ${unreadCount} non lue(s)` : 'Notifications'}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unreadCount ? (
            <span className="absolute top-1 right-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <DropdownMenuLabel className="p-0 text-sm">Notifications</DropdownMenuLabel>
          {unreadCount ? (
            <button
              type="button"
              disabled={markingAll}
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tout marquer comme lu
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">
              Chargement des notifications…
            </p>
          ) : error ? (
            <div className="px-3 py-5 text-center">
              <p role="alert" className="text-sm text-destructive">{error}</p>
              <button type="button" className="mt-2 text-xs font-medium text-primary" onClick={() => void load()}>
                Réessayer
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Vous êtes à jour. Aucune notification pour le moment.
            </p>
          ) : (
            <ul className="space-y-1">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    disabled={busyId === notification.id}
                    onClick={() => void openNotification(notification)}
                    className={`w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/70 disabled:opacity-60 ${notification.status === 'unread' ? 'bg-primary/[0.035]' : ''}`}
                  >
                    <span className="flex items-start gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.status === 'unread' ? 'bg-primary' : 'bg-transparent'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">
                          {eventTitles[notification.event_name] ?? 'Mise à jour de votre tontine'}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {notification.action_path ? 'Consulter les détails' : 'Une activité a été enregistrée dans votre compte.'}
                        </span>
                        <span className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock3 className="h-3 w-3" /> {formatDate(notification.created_at)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
