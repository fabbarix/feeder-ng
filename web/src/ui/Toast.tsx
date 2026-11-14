import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { ActionSurface } from './lib/actionSurface'
import { uiStrings } from './strings'
import './Toast.css'

/** DS-12 R-D+: only error, warning, offline and syncing carry an icon; a success toast's headline already says what happened. */
export type ToastStatus = 'neutral' | 'success' | 'error' | 'warning' | 'offline' | 'syncing'

export interface ToastOptions {
  status?: ToastStatus
  /** @deprecated use `status`; `accent` renders as `neutral`. */
  tone?: 'neutral' | 'accent'
  actionLabel?: string
  onAction?: () => void
  /** An explicit duration always wins, even for errors. */
  durationMs?: number
}

/** One real button on the toast. `ariaLabel` names it when the label alone is ambiguous ("Review" -> "Review 2 changed meals"). */
export interface ToastAction {
  label: string
  ariaLabel?: string
  onClick: () => void
}

/**
 * DS-12 R-D: a toast with detail. A toast of one sentence passes `title` only and stays one line; detail goes in a muted
 * `subline` (what it is about) and a `body` (what happened), with real `actions` under them.
 */
export interface ToastContent {
  status?: ToastStatus
  title: string
  subline?: string
  body?: string
  actions?: ToastAction[]
  /** An explicit duration always wins, even for errors. */
  durationMs?: number
}

interface ToastItem {
  id: number
  status: ToastStatus
  title: string
  subline?: string
  body?: string
  actions: ToastAction[]
}

interface ToastApi {
  /** `show('Saved', { status: 'success' })`, or the rich form `show({ status, title, subline, body, actions })`. */
  show: {
    (message: string, options?: ToastOptions): void
    (content: ToastContent): void
  }
}

const ToastContext = createContext<ToastApi | null>(null)

const DEFAULT_DURATION_MS = 4000
const ACTION_DURATION_MS = 6000
const MAX_VISIBLE = 2
const SWIPE_DISTANCE_PX = 40

const STATUS_ICON: Record<ToastStatus, IconName | null> = {
  neutral: null,
  success: null,
  error: 'error',
  warning: 'warning',
  offline: 'offline',
  syncing: 'refresh',
}

/** Errors stay until dismissed; otherwise 4 s, or 6 s with an action, unless an explicit duration is given. */
function timeoutFor(item: ToastItem, durationMs: number | undefined): number | null {
  if (durationMs !== undefined) return durationMs
  if (item.status === 'error') return null
  return item.actions.length > 0 ? ACTION_DURATION_MS : DEFAULT_DURATION_MS
}

/** Both call forms as one item (without its id) and the explicit duration. */
function normalise(arg: string | ToastContent, options: ToastOptions = {}): { item: Omit<ToastItem, 'id'>; durationMs?: number } {
  if (typeof arg === 'string') {
    const actions = options.actionLabel ? [{ label: options.actionLabel, onClick: () => options.onAction?.() }] : []
    return { item: { status: options.status ?? 'neutral', title: arg, actions }, durationMs: options.durationMs }
  }
  return {
    item: { status: arg.status ?? 'neutral', title: arg.title, subline: arg.subline, body: arg.body, actions: arg.actions ?? [] },
    durationMs: arg.durationMs,
  }
}

export function ToastProvider({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  // Pending auto-dismiss timers must not outlive the provider (they would setState after unmount).
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((items) => items.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (arg: string | ToastContent, options?: ToastOptions) => {
      const id = nextId.current++
      const { item: content, durationMs } = normalise(arg, options)
      const item: ToastItem = { id, ...content }
      setToasts((items) => {
        const kept = items.length >= MAX_VISIBLE ? items.slice(items.length - MAX_VISIBLE + 1) : items
        for (const dropped of items.filter((t) => !kept.includes(t))) {
          const timer = timers.current.get(dropped.id)
          if (timer !== undefined) clearTimeout(timer)
          timers.current.delete(dropped.id)
        }
        return [...kept, item]
      })
      const ms = timeoutFor(item, durationMs)
      if (ms !== null) timers.current.set(id, setTimeout(() => dismiss(id), ms))
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(() => ({ show: show as ToastApi['show'] }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region">
        <LiveRegion role="status" items={toasts.filter((t) => t.status !== 'error')} onDismiss={dismiss} />
        <LiveRegion role="alert" items={toasts.filter((t) => t.status === 'error')} onDismiss={dismiss} />
      </div>
    </ToastContext.Provider>
  )
}

/**
 * A persistent live region, always mounted so screen readers announce what is added to it. The region carries the role
 * and politeness; its toasts carry none. aria-atomic is off so only the added toast is read, not the whole region.
 */
function LiveRegion({ role, items, onDismiss }: { role: 'status' | 'alert'; items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'} aria-atomic="false" className="toast-live">
      {items.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}

/**
 * One toast (DS-12 R-D, R-D+). Headline (with the status icon as its first item), muted subline, body, then real buttons;
 * the 32 px circular Dismiss is top-aligned with the headline. Swipe down (pointer) dismisses it. No role: the enclosing live
 * region announces it.
 */
function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const startY = useRef<number | null>(null)
  const icon = STATUS_ICON[toast.status]
  const stacked = Boolean(toast.subline || toast.body)
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (startY.current !== null && e.clientY - startY.current > SWIPE_DISTANCE_PX) onDismiss()
    startY.current = null
  }
  return (
    <div
      className="toast"
      data-status={toast.status}
      data-layout={stacked ? 'stack' : 'line'}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (startY.current = null)}
    >
      <ActionSurface>
        <div className="toast__content">
          <p className="toast__title">
            {icon ? <Icon name={icon} size={16} /> : null}
            <span className="toast__title-text">{toast.title}</span>
          </p>
          {toast.subline ? <p className="toast__subline">{toast.subline}</p> : null}
          {toast.body ? <p className="toast__body">{toast.body}</p> : null}
          {toast.actions.length > 0 ? (
            <div className="toast__actions">
              {toast.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="toast__action"
                  aria-label={action.ariaLabel}
                  onClick={() => {
                    action.onClick()
                    onDismiss()
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" className="toast__dismiss" aria-label={uiStrings.dismiss} onClick={onDismiss}>
          <Icon name="close" size={16} />
        </button>
      </ActionSurface>
    </div>
  )
}

/** Shows transient messages. Must be used inside a ToastProvider. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside a ToastProvider')
  return api
}
