import { useLayoutEffect, useRef, type MouseEvent, type RefObject } from 'react'

export interface ModalDialogOptions {
  onClose: () => void
  /** A click whose target is the <dialog> itself (the backdrop) closes it. */
  dismissOnBackdrop: boolean
  /** The element to focus on open. Returning nothing focuses the dialog itself, which callers avoid. */
  initialFocus: (dialog: HTMLDialogElement) => HTMLElement | null | undefined
  /**
   * false: a non-modal dialog (`show()`): no backdrop, the page behind stays usable. A non-modal dialog gets no `cancel` from
   * Escape, so Escape anywhere on the page closes it, unless something already handled the key or a modal dialog is open.
   * Default true (`showModal()`).
   */
  modal?: boolean
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
    const modal = latest.current.modal !== false
    if (!dialog.open) {
      if (modal) dialog.showModal()
      else dialog.show()
    }
    const target = latest.current.initialFocus(dialog) ?? dialog
    target.focus()
    const onCancel = (event: Event) => {
      event.preventDefault()
      latest.current.onClose()
    }
    dialog.addEventListener('cancel', onCancel)
    // On window, so it runs after every document listener: a key something inside already handled (preventDefault) is left alone.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (anotherModalOpen(dialog)) return
      event.preventDefault()
      latest.current.onClose()
    }
    if (!modal) window.addEventListener('keydown', onKey)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      window.removeEventListener('keydown', onKey)
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

/** Another modal dialog is open: every open <dialog> but `self` is modal unless it is marked non-modal (only this hook opens one). */
function anotherModalOpen(self: HTMLDialogElement): boolean {
  return [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].some((d) => d !== self && d.dataset['modal'] !== 'false')
}

/** Selector for elements a user can operate (used by initialFocus pickers). */
export const INTERACTIVE_SELECTOR = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
