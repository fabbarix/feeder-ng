// B9-26 ruling 9, B9-39: after a row leaves a list while it held focus (Not cooked or Cooked from To confirm), focus moves to the row
// that took its place, else the one before it, never to the page's start. Focus that is elsewhere stays there; the first render takes none.
import { useLayoutEffect, useRef, type FocusEvent } from 'react'
import { focusAfterRemoval } from '../lib/toConfirmView'

/**
 * `keys` are the rows in order; each row element carries `data-row-focus-key` and its first `button` takes focus. Spread the
 * returned `onFocus` on the list element.
 */
export function useRowFocusAfterRemoval(keys: string[]): { onFocus: (e: FocusEvent<HTMLElement>) => void } {
  const last = useRef<string | null>(null)
  const before = useRef<string[] | null>(null)
  const joined = keys.join('|')

  useLayoutEffect(() => {
    const prev = before.current
    before.current = keys
    const gone = last.current
    if (!prev || gone === null || keys.includes(gone)) return
    last.current = null
    const active = document.activeElement
    if (active !== null && active !== document.body) return
    const target = focusAfterRemoval(prev, keys, gone)
    if (target === null) return
    const row = document.querySelector<HTMLElement>(`[data-row-focus-key="${target}"]`)
    row?.querySelector<HTMLElement>('button')?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the order of the keys is the dependency
  }, [joined])

  return {
    onFocus: (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row-focus-key]')
      last.current = row?.dataset.rowFocusKey ?? null
    },
  }
}
