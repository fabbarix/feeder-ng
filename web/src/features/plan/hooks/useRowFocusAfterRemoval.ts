// B9-26 ruling 9, B9-39: after a row leaves a list while it held focus (Not cooked or Cooked from To confirm), focus moves to the row
// that took its place, else the one before it, never to the page's start. Focus that is elsewhere stays there; the first render takes none.
import { useEffect, useLayoutEffect, useRef, type FocusEvent } from 'react'
import { focusAfterRemoval } from '../lib/toConfirmView'

/** How long focus may stay in the menu or sheet the action was chosen in before the row's removal is no longer followed. */
const POPUP_WAIT_MS = 1500
const POPUP_POLL_MS = 50

const focusLost = () => document.activeElement === null || document.activeElement === document.body
/** Focus is in a menu or a sheet (the ⋮'s Not cooked): when it closes, it would give focus back to the row that has gone. */
const focusInPopup = () => Boolean(document.activeElement?.closest('dialog, [role="menu"]'))

function focusRow(target: string): void {
  const row = document.querySelector<HTMLElement>(`[data-row-focus-key="${target}"]`)
  row?.querySelector<HTMLElement>('button')?.focus()
}

/**
 * `keys` are the rows in order; each row element carries `data-row-focus-key` and its first `button` takes focus. Spread the
 * returned `onFocus` on the list element.
 */
export function useRowFocusAfterRemoval(keys: string[]): { onFocus: (e: FocusEvent<HTMLElement>) => void } {
  const last = useRef<string | null>(null)
  const before = useRef<string[] | null>(null)
  const waiting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const joined = keys.join('|')
  useEffect(() => () => clearTimeout(waiting.current), [])

  useLayoutEffect(() => {
    const prev = before.current
    before.current = keys
    const gone = last.current
    if (!prev || gone === null || keys.includes(gone)) return
    last.current = null
    const target = focusAfterRemoval(prev, keys, gone)
    if (target === null) return
    if (focusLost()) {
      focusRow(target)
      return
    }
    // The row went while its menu or sheet was still open: once that closes and focus is lost, it goes to the row instead.
    if (!focusInPopup()) return
    clearTimeout(waiting.current)
    const until = Date.now() + POPUP_WAIT_MS
    const poll = () => {
      if (focusLost()) focusRow(target)
      else if (focusInPopup() && Date.now() < until) waiting.current = setTimeout(poll, POPUP_POLL_MS)
    }
    waiting.current = setTimeout(poll, POPUP_POLL_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the order of the keys is the dependency
  }, [joined])

  return {
    onFocus: (e) => {
      // React bubbles focus from a portal (the ⋮'s menu or sheet) through its owner: only focus inside the list itself counts.
      if (!(e.target instanceof Node) || !e.currentTarget.contains(e.target)) return
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row-focus-key]')
      last.current = row?.dataset.rowFocusKey ?? null
    },
  }
}
