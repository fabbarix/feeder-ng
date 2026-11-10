import { useLayoutEffect, useRef, type MouseEvent, type RefObject } from 'react'

export interface ModalDialogOptions {
  onClose: () => void
  /** A click whose target is the <dialog> itself (the backdrop) closes it. */
  dismissOnBackdrop: boolean
  /** The element to focus on open. Returning nothing focuses the dialog itself, which callers avoid. */
  initialFocus: (dialog: HTMLDialogElement) => HTMLElement | null | undefined
}

/**
 * Drives a modal <dialog> that is mounted only while open (docs/dev/design/wp4-primitives-b.md):
 * showModal() on mount, Escape (the `cancel` event) closes through onClose, the backdrop closes,
 * and unmounting restores focus to the element that had it when the dialog opened.
 */
export function useModalDialog(ref: RefObject<HTMLDialogElement | null>, options: ModalDialogOptions): { onBackdropClick: (e: MouseEvent<HTMLDialogElement>) => void } {
  const latest = useRef(options)
  latest.current = options

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    const target = latest.current.initialFocus(dialog) ?? dialog
    target.focus()
    const onCancel = (event: Event) => {
      event.preventDefault()
      latest.current.onClose()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      if (dialog.open) dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [ref])

  return {
    onBackdropClick: (e) => {
      if (latest.current.dismissOnBackdrop && e.target === e.currentTarget) latest.current.onClose()
    },
  }
}

/** Selector for elements a user can operate (used by initialFocus pickers). */
export const INTERACTIVE_SELECTOR = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
