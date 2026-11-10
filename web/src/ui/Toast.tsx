import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { uiStrings } from './strings'
import './Toast.css'

export interface ToastOptions {
  tone?: 'neutral' | 'accent'
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

interface ToastItem extends ToastOptions {
  id: number
  message: string
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DEFAULT_DURATION_MS = 4000

export function ToastProvider({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((items) => items.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++
      setToasts((items) => [...items, { ...options, id, message }])
      timers.current.set(id, setTimeout(() => dismiss(id), options.durationMs ?? DEFAULT_DURATION_MS))
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="toast-region">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="toast" data-tone={t.tone ?? 'neutral'}>
            <span className="toast__message">{t.message}</span>
            {t.actionLabel ? (
              <Button
                variant="tonal"
                onClick={() => {
                  t.onAction?.()
                  dismiss(t.id)
                }}
              >
                {t.actionLabel}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => dismiss(t.id)}>
              {uiStrings.dismiss}
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Shows transient messages. Must be used inside a ToastProvider. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside a ToastProvider')
  return api
}
