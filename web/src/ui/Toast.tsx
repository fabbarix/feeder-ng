import { createContext, useCallback, useContext, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import type { IconName } from './icons'
import { uiStrings } from './strings'
import './Toast.css'

export type ToastStatus = 'neutral' | 'success' | 'error' | 'info'

export interface ToastOptions {
  status?: ToastStatus
  /** @deprecated use `status`; `accent` renders as `neutral`. */
  tone?: 'neutral' | 'accent'
  actionLabel?: string
  onAction?: () => void
  /** An explicit duration always wins, even for errors. */
  durationMs?: number
}

interface ToastItem {
  id: number
  message: string
  status: ToastStatus
  actionLabel?: string
  onAction?: () => void
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DEFAULT_DURATION_MS = 4000
const ACTION_DURATION_MS = 6000
const MAX_VISIBLE = 2
const SWIPE_DISTANCE_PX = 40

const STATUS_ICON: Record<ToastStatus, IconName | null> = { neutral: null, success: 'success', error: 'error', info: 'info' }

/** Errors stay until dismissed; otherwise 4 s, or 6 s with an action, unless an explicit duration is given. */
function timeoutFor(status: ToastStatus, options: ToastOptions): number | null {
  if (options.durationMs !== undefined) return options.durationMs
  if (status === 'error') return null
  return options.actionLabel ? ACTION_DURATION_MS : DEFAULT_DURATION_MS
}

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
      const status: ToastStatus = options.status ?? 'neutral'
      const item: ToastItem = { id, message, status, actionLabel: options.actionLabel, onAction: options.onAction }
      setToasts((items) => {
        const kept = items.length >= MAX_VISIBLE ? items.slice(items.length - MAX_VISIBLE + 1) : items
        for (const dropped of items.filter((t) => !kept.includes(t))) {
          const timer = timers.current.get(dropped.id)
          if (timer !== undefined) clearTimeout(timer)
          timers.current.delete(dropped.id)
        }
        return [...kept, item]
      })
      const ms = timeoutFor(status, options)
      if (ms !== null) timers.current.set(id, setTimeout(() => dismiss(id), ms))
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="toast-region">
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** One toast. Swipe down (pointer) dismisses it. Errors use role=alert, everything else role=status. */
function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const startY = useRef<number | null>(null)
  const icon = STATUS_ICON[toast.status]
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (startY.current !== null && e.clientY - startY.current > SWIPE_DISTANCE_PX) onDismiss()
    startY.current = null
  }
  return (
    <div
      role={toast.status === 'error' ? 'alert' : 'status'}
      className="toast"
      data-status={toast.status}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (startY.current = null)}
    >
      {icon ? <Icon name={icon} size={20} /> : null}
      <span className="toast__message">{toast.message}</span>
      {toast.actionLabel ? (
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => {
            toast.onAction?.()
            onDismiss()
          }}
        >
          {toast.actionLabel}
        </Button>
      ) : null}
      <IconButton icon="close" label={uiStrings.dismiss} size="compact" onClick={onDismiss} />
    </div>
  )
}

/** Shows transient messages. Must be used inside a ToastProvider. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside a ToastProvider')
  return api
}
