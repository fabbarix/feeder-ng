import { useEffect, useRef } from 'react'

/**
 * Calls `onEscape` on Escape anywhere in the page while `active`, unless something else took the key first (a default prevented:
 * Your menu, a Popover, a Select or a DateField closing) or a dialog or sheet is open (Escape is theirs then). It never moves focus.
 * The listener is on window, so it runs after every element and document listener, whichever was added first (ui/lib/useModalDialog
 * does the same).
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape)
  handler.current = onEscape
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('dialog[open]')) return
      handler.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}
