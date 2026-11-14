import { useId, useRef, type ReactNode, type RefObject } from 'react'
import { Button, PRIMARY_SCOPE_ATTR } from './Button'
import { CloseButton } from './CloseButton'
import type { CancelButtonProps } from './Dialog'
import { ActionSurface } from './lib/actionSurface'
import { overlayStrings } from './overlayStrings'
import { INTERACTIVE_SELECTOR, useModalDialog } from './lib/useModalDialog'
import './BottomSheet.css'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children?: ReactNode
  /** Sticky action row under the scrolling body. */
  footer?: ReactNode
  /**
   * DS-12 R-B: a sheet that offers Cancel passes `onCancel`. Cancel is then a secondary Button at the footer's start (the
   * footer renders even without `footer`), and the header has no Close. Escape, the scrim and the grip still call `onClose`.
   * Without it the header carries the circular CloseButton.
   */
  onCancel?: () => void
  /** The Cancel button's label. Default "Cancel". */
  cancelLabel?: string
  /** Extra state for the Cancel button (`disabled` while busy, `data-autofocus`). */
  cancelProps?: CancelButtonProps
  /** Element to focus on open (default: the first interactive element of the body or footer, else the title). */
  initialFocusRef?: RefObject<HTMLElement | null>
  /**
   * false: a non-modal sheet. No backdrop and the page behind stays usable (a list can scroll and be tapped beside it). On a
   * phone it is fixed at the bottom over the page; from 768 px it is docked: it sits in the page where it is mounted. Escape
   * and the header Close still dismiss it. Default true.
   */
  modal?: boolean
  /** 'half': about half the viewport high on a phone, the body scrolling inside (a keypad beside a list). Default 'auto'. */
  size?: 'auto' | 'half'
}

/**
 * A modal panel that rises from the bottom (a `<dialog>`); a centred dialog from 768 px. Escape, backdrop and Close dismiss it.
 * `modal={false}` makes it a non-modal sheet (see the prop).
 */
export function BottomSheet(props: BottomSheetProps) {
  return props.open ? <SheetSurface {...props} /> : null
}

function SheetSurface({
  onClose,
  title,
  children,
  footer,
  onCancel,
  cancelLabel = overlayStrings.cancel,
  cancelProps,
  initialFocusRef,
  modal = true,
  size = 'auto',
}: Omit<BottomSheetProps, 'open'>) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const { onBackdropClick } = useModalDialog(ref, {
    onClose,
    modal,
    dismissOnBackdrop: modal,
    initialFocus: (dialog) =>
      initialFocusRef?.current ??
      dialog.querySelector<HTMLElement>(`.sheet__body ${INTERACTIVE_SELECTOR}, .sheet__footer ${INTERACTIVE_SELECTOR}`) ??
      dialog.querySelector<HTMLElement>('.sheet__title'),
  })

  return (
    <dialog
      ref={ref}
      className="sheet"
      data-modal={modal ? undefined : 'false'}
      data-size={size === 'auto' ? undefined : size}
      aria-labelledby={titleId}
      {...{ [PRIMARY_SCOPE_ATTR]: '' }}
      onClick={onBackdropClick}
    >
      <div className="sheet__panel">
        <span className="sheet__grip" aria-hidden="true" />
        <header className="sheet__header">
          <h2 id={titleId} className="sheet__title" tabIndex={-1}>
            {title}
          </h2>
          {onCancel ? null : <CloseButton onClick={onClose} />}
        </header>
        <div className="sheet__body">{children}</div>
        {footer || onCancel ? (
          <div className="sheet__footer" data-cancel={onCancel ? '' : undefined}>
            <ActionSurface>
              {onCancel ? (
                <Button variant="secondary" className="sheet__cancel" onClick={onCancel} {...cancelProps}>
                  {cancelLabel}
                </Button>
              ) : null}
              {footer}
            </ActionSurface>
          </div>
        ) : null}
      </div>
    </dialog>
  )
}
