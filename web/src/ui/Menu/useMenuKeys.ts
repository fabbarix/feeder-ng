import type { KeyboardEvent, RefObject } from 'react'

export interface UseMenuKeysOptions {
  open: boolean
  onClose: () => void
  menuRef: RefObject<HTMLElement | null>
  triggerRef: RefObject<HTMLElement | null>
}

/** R2-1 stub (extracted from app/YourMenu.tsx): focus the first item on open; Arrows, Home, End; Escape and Tab close and return focus to the trigger. */
export function useMenuKeys(_options: UseMenuKeysOptions): { onMenuKeyDown: (e: KeyboardEvent<HTMLElement>) => void } {
  return { onMenuKeyDown: () => {} }
}
