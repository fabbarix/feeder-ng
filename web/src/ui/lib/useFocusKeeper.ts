// B9-14 STUB (test author): the developer implements. See useFocusKeeper.test.tsx.
import type { RefObject } from 'react'
export interface FocusKeeperOptions {
  /** Row elements (default '[data-focus-key]'; the key is that attribute's value). */
  rowSelector?: string
  /** The list's heading, focused when no row is left. */
  heading?: () => HTMLElement | null | undefined
}
export function useFocusKeeper(_ref: RefObject<HTMLElement | null>, _options?: FocusKeeperOptions): void {}
