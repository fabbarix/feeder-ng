// SAFE R2 (B9-18; SAFE 1 and 6): "Leave without saving?" for in-app exits of an editor with unsaved changes. A router navigation
// (a link, navigate(), Back) is blocked while `dirty`; a hash-only change on the same page is not. No beforeunload prompt: a reload
// or a closed tab is covered by the reload draft (lib/drafts). Needs a data router and a ConfirmProvider.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router-dom'
import { useConfirm, type ConfirmOptions } from './ConfirmDialog'

export interface LeaveGuardOptions {
  /** What the changes are to: "Pasta al pomodoro", "your preferences", "Household settings". */
  what: string
  /** A record that was never saved: "This new <what> is not saved." */
  isNew?: boolean
  /** Runs when Discard changes is chosen, before the navigation continues (drops the reload draft). */
  onDiscard?: () => void
}

export interface LeaveGuard {
  /** Runs fn with the guard off, synchronously: Save and Cancel navigate through it. Returns what fn returns. */
  bypass: <T>(fn: () => T) => T
  /** The same dialog for an exit that is not a router navigation (Sign out). True at once when clean. */
  confirmLeave: () => Promise<boolean>
}

export const leaveGuardStrings = {
  title: 'Leave without saving?',
  lead: (what: string) => `Your changes to ${what} are not saved.`,
  leadNew: (what: string) => `This new ${what} is not saved.`,
  note: 'If you leave, they are lost.',
  noteNew: 'If you leave, it is lost.',
  keep: 'Keep editing',
  discard: 'Discard changes',
} as const

/** The leave dialog's options. Pure. */
export function leaveDialog(what: string, isNew = false): ConfirmOptions {
  return {
    title: leaveGuardStrings.title,
    body: isNew ? leaveGuardStrings.leadNew(what) : leaveGuardStrings.lead(what),
    note: isNew ? leaveGuardStrings.noteNew : leaveGuardStrings.note,
    tone: 'danger',
    icon: 'warning',
    cancelLabel: leaveGuardStrings.keep,
    confirmLabel: leaveGuardStrings.discard,
  }
}

const TEXT_FIELD = 'input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]:not([contenteditable="false"])'
const isTextField = (el: Element | null) => Boolean(el && el !== document.body && el.closest(TEXT_FIELD))

/**
 * Where focus goes after Keep editing (SHORT 2: the on-screen keyboard stays down). The control the person used to leave, unless
 * they were typing in a text field when they started (or nothing had focus): then the page's <h1>.
 */
function returnTarget(focusBefore: Element | null): HTMLElement | null {
  const active = document.activeElement
  if (isTextField(focusBefore)) return pageTitle()
  if (active instanceof HTMLElement && active !== document.body && !isTextField(active)) return active
  return pageTitle()
}

/** The page's <h1>, made focusable from script (tabindex -1) if it is not already: a PageHeader title is a plain <h1>. */
function pageTitle(): HTMLElement | null {
  const h1 = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1')
  if (h1 && !h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
  return h1
}

export function useLeaveGuard(dirty: boolean, { what, isNew, onDiscard }: LeaveGuardOptions): LeaveGuard {
  const confirmApi = useConfirm()
  const dirtyRef = useRef(dirty)
  const bypassing = useRef(false)
  const asking = useRef(false)
  // What had focus just before the pointer or key that started the exit (a click moves focus to the control it pressed).
  const focusBefore = useRef<Element | null>(null)
  const latest = useRef({ what, isNew, onDiscard })

  useEffect(() => {
    dirtyRef.current = dirty
    latest.current = { what, isNew, onDiscard }
  })

  useEffect(() => {
    const remember = () => {
      focusBefore.current = document.activeElement
    }
    document.addEventListener('pointerdown', remember, true)
    document.addEventListener('keydown', remember, true)
    return () => {
      document.removeEventListener('pointerdown', remember, true)
      document.removeEventListener('keydown', remember, true)
    }
  }, [])

  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    if (!dirtyRef.current || bypassing.current) return false
    const hashOnly = currentLocation.pathname === nextLocation.pathname && currentLocation.search === nextLocation.search
    return !hashOnly
  }, [])
  const blocker = useBlocker(shouldBlock)

  /** Asks; true means Discard changes (onDiscard has run). Keep editing puts focus back where SHORT 2 wants it. */
  const ask = useCallback(async (): Promise<boolean> => {
    const target = returnTarget(focusBefore.current)
    // The dialog gives focus back to what had it when it opened: put focus on the return target first.
    if (target && document.activeElement !== target) target.focus({ preventScroll: true })
    const { what: w, isNew: n, onDiscard: discard } = latest.current
    const leave = await confirmApi.confirm(leaveDialog(w, n))
    if (leave) discard?.()
    return leave
  }, [confirmApi])

  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void ask().then((leave) => {
      asking.current = false
      if (leave) blocker.proceed?.()
      else blocker.reset?.()
    })
  }, [blocker, ask])

  const bypass = useCallback(<T,>(fn: () => T): T => {
    bypassing.current = true
    try {
      return fn()
    } finally {
      bypassing.current = false
    }
  }, [])

  const confirmLeave = useCallback(async () => (dirtyRef.current ? ask() : true), [ask])

  return useMemo(() => ({ bypass, confirmLeave }), [bypass, confirmLeave])
}
