import { useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { ActionSurface } from './lib/actionSurface'
import { stopReactPropagation } from './lib/portalStop'
import { INTERACTIVE_SELECTOR, useModalDialog } from './lib/useModalDialog'
import { Button, PRIMARY_SCOPE_ATTR } from './Button'
import { overlayStrings } from './overlayStrings'
import './Dialog.css'

/** What a sheet or dialog may set on its own Cancel. */
export interface CancelButtonProps {
  'data-autofocus'?: boolean
  disabled?: boolean
}

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
  /** Right-aligned action row: the decision (primary or danger). Cancel comes from `onCancel`. */
  actions?: ReactNode
  /**
   * DS-12 R-B: renders a secondary Cancel first in the action row (the row renders even without `actions`). A Dialog never has
   * a Close; Escape and (unless `dismissOnBackdrop` is false) the scrim still call `onClose`.
   */
  onCancel?: () => void
  /** The Cancel button's label. Default "Cancel". */
  cancelLabel?: string
  /** Extra state for the Cancel button: `data-autofocus` (a danger confirm focuses Cancel), `disabled` (while busy). */
  cancelProps?: CancelButtonProps
  /** A muted meta line above the title ("Tue 17 · Dinner"); part of the dialog's accessible name. */
  context?: string
  /** Default true. Destructive confirms pass false. */
  dismissOnBackdrop?: boolean
  /** Element to focus on open. Default: the first [data-autofocus], else the first focusable, else the title. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/** A modal `<dialog>` opened with showModal(), portalled to document.body. Mounted only while open. */
export function Dialog(props: DialogProps): ReactNode {
  return props.open ? <DialogSurface {...props} /> : null
}

function DialogSurface({
  onClose,
  title,
  icon,
  tone = 'default',
  children,
  actions,
  onCancel,
  cancelLabel = overlayStrings.cancel,
  cancelProps,
  context,
  dismissOnBackdrop = true,
  initialFocusRef,
}: Omit<DialogProps, 'open'>) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const contextId = useId()
  const { onBackdropClick } = useModalDialog(ref, {
    onClose,
    dismissOnBackdrop,
    initialFocus: (dialog) => {
      const explicit = initialFocusRef?.current
      if (explicit) return explicit
      const autofocus = dialog.querySelector<HTMLElement>('[data-autofocus]')
      if (autofocus) return autofocus
      const first = dialog.querySelector<HTMLElement>(`.dialog__actions ${INTERACTIVE_SELECTOR}, .dialog__body ${INTERACTIVE_SELECTOR}`)
      return first ?? dialog.querySelector<HTMLElement>('.dialog__title')
    },
  })

  return createPortal(
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={context ? `${contextId} ${titleId}` : titleId}
      data-tone={tone}
      {...{ [PRIMARY_SCOPE_ATTR]: '' }}
      onClick={(e) => {
        onBackdropClick(e)
        stopReactPropagation(e)
      }}
      onPointerDown={stopReactPropagation}
      onKeyDown={stopReactPropagation}
    >
      <div className="dialog__panel">
        {icon ? (
          <span className="dialog__icon" aria-hidden="true">
            <Icon name={icon} size={24} />
          </span>
        ) : null}
        {context ? (
          <p id={contextId} className="dialog__context">
            {context}
          </p>
        ) : null}
        <h2 id={titleId} className="dialog__title" tabIndex={-1}>
          {title}
        </h2>
        {children ? <div className="dialog__body">{children}</div> : null}
        {actions || onCancel ? (
          <div className="dialog__actions">
            <ActionSurface>
              {onCancel ? (
                <Button variant="secondary" onClick={onCancel} {...cancelProps}>
                  {cancelLabel}
                </Button>
              ) : null}
              {actions}
            </ActionSurface>
          </div>
        ) : null}
      </div>
    </dialog>,
    document.body,
  )
}
