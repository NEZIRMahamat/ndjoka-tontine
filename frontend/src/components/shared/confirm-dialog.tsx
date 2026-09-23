import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void }

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve })
    })
  }, [])

  const close = (result: boolean) => {
    state?.resolve(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={state !== null} onOpenChange={(open) => { if (!open) close(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state?.title}</AlertDialogTitle>
            {state?.description ? (
              <AlertDialogDescription>{state.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>
              {state?.cancelLabel ?? 'Annuler'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => close(true)}
              className={cn(state?.destructive && 'bg-destructive text-white hover:bg-destructive/90')}
            >
              {state?.confirmLabel ?? 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm doit être utilisé dans ConfirmProvider')
  return confirm
}
