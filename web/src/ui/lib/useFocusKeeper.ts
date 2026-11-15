// B9-14 / A11Y-07 "a row leaves its list": focus that fell with a removed row goes to its successor, the heading, or the list.
import { useEffect, useRef, type RefObject } from 'react'
import { focusSuccessor } from './focusSuccessor'
import { INTERACTIVE_SELECTOR } from './useModalDialog'

export interface FocusKeeperOptions {
  /** Row elements (default '[data-focus-key]'; the key is that attribute's value). */
  rowSelector?: string
  /** The list's heading, focused when no row is left. */
  heading?: () => HTMLElement | null | undefined
}

const DEFAULT_ROW = '[data-focus-key]'
const KEY_ATTR = 'data-focus-key'

export function useFocusKeeper(ref: RefObject<HTMLElement | null>, options?: FocusKeeperOptions): void {
  const rowSelector = options?.rowSelector ?? DEFAULT_ROW
  // The heading getter is usually an inline function: read the latest without re-subscribing every render.
  const headingRef = useRef(options?.heading)
  headingRef.current = options?.heading
  useEffect(() => {
    const list = ref.current
    if (!list) return
    const rowKey = (row: Element, i: number) => row.getAttribute(KEY_ATTR) ?? `#${i}`
    const keysOf = () => [...list.querySelectorAll(rowSelector)].map(rowKey)
    let focused: { key: string; keys: string[] } | null = null

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null
      const row = target?.closest(rowSelector)
      if (!row || !list.contains(row)) {
        focused = null
        return
      }
      const rows = [...list.querySelectorAll(rowSelector)]
      focused = { key: rowKey(row, rows.indexOf(row)), keys: rows.map(rowKey) }
    }
    const onFocusOut = (e: FocusEvent) => {
      // Focus moved on purpose to something outside the list: forget the row.
      const next = e.relatedTarget as Node | null
      if (next && !list.contains(next)) focused = null
    }

    const restore = () => {
      if (!focused) return
      const active = document.activeElement
      const lost = !active || active === document.body || !active.isConnected
      if (!lost) return
      const after = keysOf()
      if (after.includes(focused.key)) return
      const successor = focusSuccessor(focused.keys, after, focused.key)
      focused = null
      if (successor !== null) {
        const row = [...list.querySelectorAll<HTMLElement>(rowSelector)].find((r, i) => rowKey(r, i) === successor)
        if (row) {
          const target = row.matches(INTERACTIVE_SELECTOR) ? row : row.querySelector<HTMLElement>(INTERACTIVE_SELECTOR) ?? row
          if (target === row && !row.matches(INTERACTIVE_SELECTOR)) row.tabIndex = -1
          target.focus()
          return
        }
      }
      const h = headingRef.current?.()
      const fallback = h ?? list
      if (!fallback.hasAttribute('tabindex')) fallback.tabIndex = -1
      fallback.focus()
    }

    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(restore)
    observer?.observe(list, { childList: true, subtree: true })
    list.addEventListener('focusin', onFocusIn)
    list.addEventListener('focusout', onFocusOut)
    return () => {
      observer?.disconnect()
      list.removeEventListener('focusin', onFocusIn)
      list.removeEventListener('focusout', onFocusOut)
    }
  }, [ref, rowSelector])
}
