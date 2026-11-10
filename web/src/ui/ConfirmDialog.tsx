import type { ReactNode } from 'react'

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel: string
  /** Default 'Cancel'. */
  cancelLabel?: string
  /** `danger`: destructive icon, initial focus on Cancel, backdrop does not dismiss. */
  tone?: 'default' | 'danger'
  /** Optional middle choice, e.g. "Archive instead". Only `choose()` can return it. */
  alternateLabel?: string
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  onAlternate?: () => void
}

export type ConfirmChoice = 'confirm' | 'alternate' | 'cancel'

export interface ConfirmApi {
  /** Resolves true on confirm; false on Cancel, Escape or backdrop. Calls made while one is open are queued. */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Like confirm, but distinguishes the alternate choice. */
  choose: (options: ConfirmOptions) => Promise<ConfirmChoice>
}

/** STUB (WP4 designer). Controlled confirmation built on Dialog. */
export function ConfirmDialog(_props: ConfirmDialogProps): ReactNode {
  throw new Error('not implemented')
}

/** STUB. Hosts the single ConfirmDialog behind useConfirm(). Mounted once in the app shell. */
export function ConfirmProvider(_props: { children?: ReactNode }): ReactNode {
  throw new Error('not implemented')
}

/** STUB. Replaces window.confirm. Throws outside a ConfirmProvider. */
export function useConfirm(): ConfirmApi {
  throw new Error('not implemented')
}
