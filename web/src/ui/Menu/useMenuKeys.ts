import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

export interface UseMenuKeysOptions {
  open: boolean
  onClose: () => void
  menuRef: RefObject<HTMLElement | null>
  triggerRef: RefObject<HTMLElement | null>
}

const ITEM = '[role="menuitem"], [role="menuitemcheckbox"]'

const itemsIn = (menu: HTMLElement | null): HTMLElement[] =>
  menu ? Array.from(menu.querySelectorAll<HTMLElement>(ITEM)).filter((el) => el.getAttribute('aria-disabled') !== 'true') : []

/** Keyboard rules of a menu: first item gets focus on open; Arrows wrap, Home and End jump; Escape and Tab close and return focus to the trigger. */
export function useMenuKeys({ open, onClose, menuRef, triggerRef }: UseMenuKeysOptions): {
  onMenuKeyDown: (e: KeyboardEvent<HTMLElement>) => void
} {
  const close = useRef(onClose)
  close.current = onClose

  // Focus goes to the first item on open, never to a highlighted last item.
  useEffect(() => {
    if (open) itemsIn(menuRef.current)[0]?.focus()
  }, [open, menuRef])

  // Escape closes from anywhere and returns focus to the trigger.
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      close.current()
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, triggerRef])

  const onMenuKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const list = itemsIn(menuRef.current)
    const current = list.indexOf(document.activeElement as HTMLElement)
    const last = list.length - 1
    const go = (to: number) => {
      e.preventDefault()
      list[to]?.focus()
    }
    switch (e.key) {
      case 'ArrowDown':
        go(current < 0 || current === last ? 0 : current + 1)
        break
      case 'ArrowUp':
        go(current <= 0 ? last : current - 1)
        break
      case 'Home':
        go(0)
        break
      case 'End':
        go(last)
        break
      case 'Tab':
        // Tab leaves the menu: it closes, and focus returns to the trigger rather than falling to the page.
        e.preventDefault()
        close.current()
        triggerRef.current?.focus()
        break
    }
  }

  return { onMenuKeyDown }
}
