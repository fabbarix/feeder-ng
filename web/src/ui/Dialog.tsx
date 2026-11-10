import { useId, useRef, type ReactNode, type RefObject } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { INTERACTIVE_SELECTOR, useModalDialog } from './lib/useModalDialog'
import { PRIMARY_SCOPE_ATTR } from './Button'
import './Dialog.css'

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

/** A modal `<dialog>` opened with showModal(). Mounted only while open. */
export function Dialog(props: DialogProps): ReactNode {
  return props.open ? <DialogSurface {...props} /> : null
}

function DialogSurface({ onClose, title, icon, tone = 'default', children, actions, dismissOnBackdrop = true, initialFocusRef }: Omit<DialogProps, 'open'>) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
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

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} data-tone={tone} {...{ [PRIMARY_SCOPE_ATTR]: '' }} onClick={onBackdropClick}>
      <div className="dialog__panel">
        {icon ? (
          <span className="dialog__icon" aria-hidden="true">
            <Icon name={icon} size={24} />
          </span>
        ) : null}
        <h2 id={titleId} className="dialog__title" tabIndex={-1}>
          {title}
        </h2>
        {children ? <div className="dialog__body">{children}</div> : null}
        {actions ? <div className="dialog__actions">{actions}</div> : null}
      </div>
    </dialog>
  )
}
