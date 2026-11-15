import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { createPortal } from 'react-dom'
import { ActionSurface } from './lib/actionSurface'
import { useModalHost } from './lib/useModalHost'
import { splitToastText } from './lib/toastText'
import { uiStrings } from './strings'
import './Toast.css'

/** DS-12 R-D+: only error, warning, offline and syncing carry an icon; a success toast's headline already says what happened. */
export type ToastStatus = 'neutral' | 'success' | 'info' | 'error' | 'warning' | 'offline' | 'syncing' | 'pending'

export interface ToastOptions {
  status?: ToastStatus
  /** @deprecated use `status`; `accent` renders as `neutral`. */
  tone?: 'neutral' | 'accent'
  actionLabel?: string
  onAction?: () => void
  /** An explicit duration always wins, even for errors (not for a sticky toast). */
  durationMs?: number
  /** Stays until an action or Dismiss is used: no timer, never held, never pushed out by another lane. */
  sticky?: boolean
}

/** What a toast action is told when it runs: whether keyboard focus was inside the toast (the screen then moves focus on). */
export interface ToastActionContext {
  focusWasInToast: boolean
}

/**
 * One real button on the toast. `ariaLabel` names it when the label alone is ambiguous ("Review" -> "Review 2 changed meals").
 * `role: 'undo'` marks the pending Undo (8 s, protected, the Ctrl+Z / Cmd+Z target); `role: 'dismiss'` marks an action that only
 * closes the toast ("Later"), so the round Dismiss is not drawn.
 */
export interface ToastAction {
  label: string
  ariaLabel?: string
  role?: 'undo' | 'dismiss'
  /** `ctx` is always passed by the toast; it is optional so a test or a caller can run an action directly. */
  onClick: (ctx?: ToastActionContext) => void
}

/**
 * DS-12 R-D: a toast with detail. A toast of one sentence passes `title` only and stays one line; detail goes in a muted
 * `subline` (what it is about) and a `body` (what happened), with real `actions` under them.
 */
export interface ToastContent {
  status?: ToastStatus
  /** A string, or a node (additive, B9-52) where part of it must wrap its own way: an email that breaks only at "@" and ".". */
  title: ReactNode
  subline?: string
  body?: string
  actions?: ToastAction[]
  /** An explicit duration always wins, even for errors (not for a sticky toast). */
  durationMs?: number
  /** Stays until an action or Dismiss is used (the update prompt, a refused Undo). */
  sticky?: boolean
}

/** What show() returns: the toast's id and a way to close it (harmless once it has gone). */
export interface ToastHandle {
  id: number
  dismiss: () => void
}

/**
 * SAFE R1: each lane keeps one toast. A newer toast replaces the older one in its own lane; no lane pushes out another, so an
 * ordinary toast never evicts a pending Undo, an error or the update prompt.
 */
type Lane = 'ordinary' | 'error' | 'sticky' | 'undo'

interface ToastItem {
  id: number
  lane: Lane
  status: ToastStatus
  title: ReactNode
  subline?: string
  body?: string
  actions: ToastAction[]
}

export interface ToastApi {
  /**
   * `show('Saved', { status: 'success' })`, or the rich form `show({ status, title, subline, body, actions })`. `options`
   * applies to the string form only.
   */
  show: (arg: string | ToastContent, options?: ToastOptions) => ToastHandle
  /**
   * SSP-12: while any hold is on, new toasts are not rendered (nothing is announced); on the last release the latest held toast
   * of each lane shows, with its full duration (a held Undo is never dropped by a later ordinary toast). Errors and sticky toasts
   * are never held. Returns the release (calling it twice is harmless).
   */
  hold: () => () => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DEFAULT_DURATION_MS = 4000
const ACTION_DURATION_MS = 6000
/** SAFE 5: an Undo toast lasts 8 s (Scan passes its own 5 s). */
export const UNDO_DURATION_MS = 8000
/** A paused toast resumes with what it had left, but never less than this, so Undo cannot vanish as the pointer leaves. */
export const RESUME_MIN_MS = 2000
const SWIPE_DISTANCE_PX = 40

const STATUS_ICON: Record<ToastStatus, IconName | null> = {
  neutral: null,
  success: null,
  info: null,
  error: 'error',
  warning: 'warning',
  offline: 'offline',
  syncing: 'refresh',
  pending: null, // B9-54 STUB: 'duration' (Phosphor Clock) once built
}

type PauseReason = 'hover' | 'focus' | 'hidden'

/** One toast's clock: what is left, when it last started, and what is pausing it. `remaining` null: no timer at all. */
interface Clock {
  remaining: number | null
  startedAt: number
  handle?: ReturnType<typeof setTimeout>
  pausedBy: Set<PauseReason>
  /** It was paused while running, so it resumes with at least RESUME_MIN_MS. */
  paused: boolean
}

function laneOf(item: Omit<ToastItem, 'id' | 'lane'>, sticky: boolean): Lane {
  if (item.actions.some((a) => a.role === 'undo')) return 'undo'
  if (item.status === 'error') return 'error'
  if (sticky) return 'sticky'
  return 'ordinary'
}

/** A sticky toast and an error stay; otherwise an explicit duration, 8 s with an Undo, 6 s with an action, 4 s. */
function timeoutFor(item: ToastItem, durationMs: number | undefined, sticky: boolean): number | null {
  if (sticky) return null
  if (durationMs !== undefined) return durationMs
  if (item.status === 'error') return null
  if (item.lane === 'undo') return UNDO_DURATION_MS
  return item.actions.length > 0 ? ACTION_DURATION_MS : DEFAULT_DURATION_MS
}

interface Normalised {
  item: Omit<ToastItem, 'id' | 'lane'>
  durationMs?: number
  sticky: boolean
}

/** Both call forms as one item (without its id) and the explicit duration. The string form splits off a body (lib/toastText). */
function normalise(arg: string | ToastContent, options: ToastOptions = {}): Normalised {
  if (typeof arg === 'string') {
    const actions: ToastAction[] = options.actionLabel ? [{ label: options.actionLabel, onClick: () => options.onAction?.() }] : []
    // A message of several sentences is a headline and a body (R-D); one sentence stays one line.
    const { title, body } = splitToastText(arg)
    return { item: { status: options.status ?? 'neutral', title, body, actions }, durationMs: options.durationMs, sticky: Boolean(options.sticky) }
  }
  return {
    item: { status: arg.status ?? 'neutral', title: arg.title, subline: arg.subline, body: arg.body, actions: arg.actions ?? [] },
    durationMs: arg.durationMs,
    sticky: Boolean(arg.sticky),
  }
}

const pageHidden = () => typeof document !== 'undefined' && document.hidden

/**
 * Ctrl+Z / Cmd+Z is not the toast's while focus is in something that edits text (the browser undoes typing), or inside an open
 * sheet, dialog or popover: that surface is what the person is working in (the Price keypad, a form sheet), and an Undo behind
 * it would change the screen under it.
 */
function keepsUndoKey(el: EventTarget | Element | null): boolean {
  if (!(el instanceof Element)) return false
  if (el.closest('input, textarea, select, dialog[open], [role="dialog"], [role="alertdialog"]')) return true
  return (el instanceof HTMLElement && el.isContentEditable) || el.closest('[contenteditable]:not([contenteditable="false"])') !== null
}

interface Held {
  item: ToastItem
  durationMs?: number
  sticky: boolean
}

export function ToastProvider({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // The toasts on screen, kept in a ref too so show(), the timers and the shortcut read the latest without a re-render.
  const items = useRef<ToastItem[]>([])
  const nextId = useRef(1)
  const clocks = useRef(new Map<number, Clock>())
  const holds = useRef(new Set<number>())
  const nextHold = useRef(1)
  // SSP-12: the latest held toast of each lane, so a held Undo is not dropped by a later ordinary toast (lanes, SAFE R1).
  const held = useRef(new Map<Lane, Held>())
  const alive = useRef(true)

  const commit = useCallback((next: ToastItem[]) => {
    items.current = next
    if (alive.current) setToasts(next)
  }, [])

  const stopClock = useCallback((id: number) => {
    const clock = clocks.current.get(id)
    if (clock?.handle !== undefined) clearTimeout(clock.handle)
    clocks.current.delete(id)
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      for (const [lane, h] of held.current) if (h.item.id === id) held.current.delete(lane)
      stopClock(id)
      if (items.current.some((t) => t.id === id)) commit(items.current.filter((t) => t.id !== id))
    },
    [commit, stopClock],
  )

  const run = useCallback(
    (id: number, clock: Clock) => {
      if (clock.remaining === null || clock.pausedBy.size > 0 || clock.handle !== undefined) return
      clock.startedAt = Date.now()
      clock.handle = setTimeout(() => dismiss(id), clock.remaining)
    },
    [dismiss],
  )

  const pause = useCallback((id: number, reason: PauseReason) => {
    const clock = clocks.current.get(id)
    if (!clock) return
    clock.pausedBy.add(reason)
    if (clock.handle === undefined || clock.remaining === null) return
    clearTimeout(clock.handle)
    clock.handle = undefined
    clock.remaining = Math.max(0, clock.remaining - (Date.now() - clock.startedAt))
    clock.paused = true
  }, [])

  const resume = useCallback(
    (id: number, reason: PauseReason) => {
      const clock = clocks.current.get(id)
      if (!clock || !clock.pausedBy.delete(reason) || clock.pausedBy.size > 0) return
      if (clock.paused && clock.remaining !== null) clock.remaining = Math.max(clock.remaining, RESUME_MIN_MS)
      clock.paused = false
      run(id, clock)
    },
    [run],
  )

  /** Puts a toast on screen: it replaces the toast of its own lane and starts its clock (paused while the page is hidden). */
  const place = useCallback(
    (item: ToastItem, durationMs: number | undefined, sticky: boolean) => {
      for (const old of items.current.filter((t) => t.lane === item.lane)) stopClock(old.id)
      commit([...items.current.filter((t) => t.lane !== item.lane), item])
      const clock: Clock = { remaining: timeoutFor(item, durationMs, sticky), startedAt: 0, pausedBy: new Set(), paused: false }
      if (pageHidden()) clock.pausedBy.add('hidden')
      clocks.current.set(item.id, clock)
      run(item.id, clock)
    },
    [commit, run, stopClock],
  )

  const show = useCallback(
    (arg: string | ToastContent, options?: ToastOptions): ToastHandle => {
      const id = nextId.current++
      const { item: content, durationMs, sticky } = normalise(arg, options)
      const item: ToastItem = { id, lane: laneOf(content, sticky), ...content }
      if (holds.current.size > 0 && item.lane !== 'error' && !sticky) held.current.set(item.lane, { item, durationMs, sticky })
      else place(item, durationMs, sticky)
      return { id, dismiss: () => dismiss(id) }
    },
    [dismiss, place],
  )

  const hold = useCallback(() => {
    const token = nextHold.current++
    holds.current.add(token)
    return () => {
      if (!holds.current.delete(token) || holds.current.size > 0) return
      const pending = [...held.current.values()].sort((a, b) => a.item.id - b.item.id)
      held.current.clear()
      if (alive.current) for (const h of pending) place(h.item, h.durationMs, h.sticky)
    }
  }, [place])

  /** Runs a toast action at most once: the toast closes first, so a second click or Ctrl+Z finds nothing to run. */
  const runAction = useCallback(
    (id: number, action: ToastAction, ctx: ToastActionContext) => {
      if (!items.current.some((t) => t.id === id)) return
      dismiss(id)
      action.onClick(ctx)
    },
    [dismiss],
  )

  // Timers must not outlive the provider (they would setState after unmount).
  useEffect(() => {
    alive.current = true
    const all = clocks.current
    return () => {
      alive.current = false
      for (const clock of all.values()) if (clock.handle !== undefined) clearTimeout(clock.handle)
      all.clear()
      held.current.clear()
    }
  }, [])

  // SAFE 5: every timed toast pauses while the page is hidden.
  useEffect(() => {
    const onVisibility = () => {
      for (const id of [...clocks.current.keys()]) {
        if (pageHidden()) pause(id, 'hidden')
        else resume(id, 'hidden')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause, resume])

  // SAFE R1: Ctrl+Z / Cmd+Z runs the newest Undo on screen, unless focus is in a text field or an open sheet (keepsUndoKey).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
      if (e.defaultPrevented || keepsUndoKey(e.target) || keepsUndoKey(document.activeElement)) return
      const target = [...items.current].reverse().find((t) => t.actions.some((a) => a.role === 'undo'))
      const undo = target?.actions.find((a) => a.role === 'undo')
      if (!target || !undo) return
      e.preventDefault()
      runAction(target.id, undo, { focusWasInToast: false })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [runAction])

  const api = useMemo<ToastApi>(() => ({ show, hold }), [show, hold])
  const modalHost = useModalHost()
  const byAge = [...toasts].sort((a, b) => a.id - b.id)
  const view = (t: ToastItem) => (
    <ToastView
      key={t.id}
      toast={t}
      onDismiss={() => dismiss(t.id)}
      onAction={(action, ctx) => runAction(t.id, action, ctx)}
      onPause={(reason) => pause(t.id, reason)}
      onResume={(reason) => resume(t.id, reason)}
    />
  )

  const region = (
    <div className="toast-region">
      {/* an error sits above the other lanes; of the rest, the newest is nearest the thumb */}
      <LiveRegion role="alert">{byAge.filter((t) => t.status === 'error').map(view)}</LiveRegion>
      <LiveRegion role="status">{byAge.filter((t) => t.status !== 'error').map(view)}</LiveRegion>
    </div>
  )
  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Batch w3e: while a modal sheet or dialog is open, a toast with an action (Undo, Change) is shown inside it, so it is seen and
          its action reachable; a plain toast stays in the page, as before. */}
      {modalHost && toasts.some((t) => t.actions.length > 0) ? createPortal(region, modalHost) : region}
    </ToastContext.Provider>
  )
}

/**
 * A persistent live region, always mounted so screen readers announce what is added to it. The region carries the role
 * and politeness; its toasts carry none. aria-atomic is off so only the added toast is read, not the whole region.
 */
function LiveRegion({ role, children }: { role: 'status' | 'alert'; children: ReactNode }) {
  return (
    <div role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'} aria-atomic="false" className="toast-live">
      {children}
    </div>
  )
}

interface ToastViewProps {
  toast: ToastItem
  onDismiss: () => void
  onAction: (action: ToastAction, ctx: ToastActionContext) => void
  onPause: (reason: PauseReason) => void
  onResume: (reason: PauseReason) => void
}

/**
 * One toast (DS-12 R-D, R-D+). Headline (with the status icon as its first item), muted subline, body, then real buttons;
 * the 32 px circular Dismiss is top-aligned with the headline, and left out when an action already only closes the toast.
 * A toast with detail, or with more than one action, stacks; a one-sentence toast with one action is one line.
 * Pointing at it or focusing inside it pauses its timer. Swipe down (pointer) dismisses it. No role: the enclosing live region
 * announces it, and it never takes focus.
 */
function ToastView({ toast, onDismiss, onAction, onPause, onResume }: ToastViewProps) {
  const root = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  // Whether focus was inside the toast when the pointer went down (the click then moves focus to the button it pressed).
  const focusBeforePointer = useRef<boolean | null>(null)
  // Where keyboard focus came from when it entered the toast (the end of the page): it goes back there when the toast closes
  // under it, never to <body>. The action runs after, so a screen can still move focus on (to the row Undo brought back).
  const cameFrom = useRef<HTMLElement | null>(null)
  const icon = STATUS_ICON[toast.status]
  const stacked = Boolean(toast.subline || toast.body) || toast.actions.length > 1
  const hasDismiss = !toast.actions.some((a) => a.role === 'dismiss')
  const focusInside = () => Boolean(root.current?.contains(document.activeElement))
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (startY.current !== null && e.clientY - startY.current > SWIPE_DISTANCE_PX) onDismiss()
    startY.current = null
  }
  /** Whether focus was in the toast before this press; if so it is handed back first, as the toast is about to go. */
  const leaving = () => {
    const focusWasInToast = focusBeforePointer.current ?? focusInside()
    focusBeforePointer.current = null
    const back = cameFrom.current
    if (focusWasInToast && back?.isConnected) back.focus({ preventScroll: true })
    return focusWasInToast
  }
  const runAction = (action: ToastAction) => onAction(action, { focusWasInToast: leaving() })
  const dismiss = () => {
    leaving()
    onDismiss()
  }
  return (
    <div
      ref={root}
      className="toast"
      data-status={toast.status}
      data-layout={stacked ? 'stack' : 'line'}
      data-dismiss={hasDismiss ? undefined : 'none'}
      onPointerDownCapture={() => (focusBeforePointer.current = focusInside())}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (startY.current = null)}
      onPointerEnter={() => onPause('hover')}
      onPointerLeave={() => onResume('hover')}
      onFocus={(e) => {
        const from = e.relatedTarget
        if (from instanceof HTMLElement && !root.current?.contains(from)) cameFrom.current = from
        onPause('focus')
      }}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) onResume('focus')
      }}
    >
      <ActionSurface>
        <div className="toast__content">
          <p className="toast__title">
            {icon ? <Icon name={icon} size={16} /> : null}
            <span className="toast__title-text">{toast.title}</span>
          </p>
          {/* the spaces keep the announced text one readable run: "headline subline body actions", never "headlinesubline" */}
          {toast.subline ? <> <p className="toast__subline">{toast.subline}</p></> : null}
          {toast.body ? <> <p className="toast__body">{toast.body}</p></> : null}
          {toast.actions.length > 0 ? (
            <>
              {' '}
              <div className="toast__actions">
                {toast.actions.map((action) => (
                  <button key={action.label} type="button" className="toast__action" aria-label={action.ariaLabel} onClick={() => runAction(action)}>
                    {action.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
        {hasDismiss ? (
          <button type="button" className="toast__dismiss" aria-label={uiStrings.dismiss} onClick={dismiss}>
            <Icon name="close" size={16} />
          </button>
        ) : null}
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
