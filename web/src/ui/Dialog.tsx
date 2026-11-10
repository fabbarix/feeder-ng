import type { ReactNode, RefObject } from 'react'
import type { IconName } from './icons'

export interface DialogProps {
  open: boolean
  /** Called on Escape and (unless `dismissOnBackdrop` is false) on a backdrop click. The parent sets `open` to false. */
  onClose: () => void
  /** Rendered as an h2 and used as the accessible name. */
  title: string
  /** Optional 48 px status icon circle above the title. */
  icon?: IconName
  /** `danger` colours the icon circle with the danger status tokens. */
  tone?: 'default' | 'danger'
  children?: ReactNode
  /** Right-aligned action row (tertiary Cancel, then primary or danger). */
  actions?: ReactNode
  /** Default true. Destructive confirms pass false. */
  dismissOnBackdrop?: boolean
  /** Element to focus on open. Default: the first [data-autofocus], else the first focusable, else the title. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/** STUB (WP4 designer). A modal `<dialog>` opened with showModal(). Spec: docs/dev/design/wp4-primitives-b.md. */
export function Dialog(_props: DialogProps): ReactNode {
  throw new Error('not implemented')
}
