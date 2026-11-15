import { useCallback, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button, PRIMARY_SCOPE_ATTR } from './Button'
import { sheetStrings } from './BottomSheet.strings'
import { CloseButton } from './CloseButton'
import { Dialog, type CancelButtonProps } from './Dialog'
import { ActionSurface } from './lib/actionSurface'
import { inheritScheme, stopReactPropagation } from './lib/portalStop'
import { footerShouldFlow } from './lib/sheetLayout'
import { overlayStrings } from './overlayStrings'
import { INTERACTIVE_SELECTOR, useModalDialog } from './lib/useModalDialog'
import './BottomSheet.css'

/** B9-14: the footer commit of a sheet whose body is a form (see BottomSheet.footer.test.tsx). */
export interface SheetSubmit {
  label: ReactNode
  /** The id of the `<form>` in the body. */
  form: string
  disabled?: boolean
  /** The save is in flight: the Button shows its spinner and is disabled (additive to the pinned API). */
  loading?: boolean
  tone?: 'danger'
}

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
  /** false hides the header Close (Escape and the scrim still dismiss). Default true. With `onCancel` there is never a Close. */
  closeButton?: boolean
  /** A muted meta line above the title ("Mon 16 Nov · Dinner"); part of the dialog's accessible name. */
  context?: string
  /** The caller's dirty flag. While true every dismissal (Escape, scrim, Close, Cancel) asks "Discard changes?" first. */
  confirmDismiss?: boolean
  /** The footer's primary submit Button, bound to the body's `<form id>` by its `form` attribute; last in the footer. */
  submit?: SheetSubmit
  /** 'half': about half the viewport high on a phone, the body scrolling inside (a keypad beside a list). Default 'auto'. */
  size?: 'auto' | 'half'
}

/**
 * A modal panel that rises from the bottom (a `<dialog>` portalled to document.body); a centred dialog from 768 px. Escape,
 * backdrop and Close dismiss it. `modal={false}` makes it a non-modal sheet that stays where it is mounted (see the prop).
 */
export function BottomSheet(props: BottomSheetProps) {
  return props.open ? <SheetSurface {...props} /> : null
}

type Dismissal = 'close' | 'cancel'

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
  closeButton = true,
  context,
  confirmDismiss = false,
  submit,
  size = 'auto',
}: Omit<BottomSheetProps, 'open'>) {
  const ref = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const contextId = useId()
  const [asking, setAsking] = useState<Dismissal | null>(null)

  const dismiss = useCallback(
    (kind: Dismissal) => {
      if (confirmDismiss) setAsking(kind)
      else if (kind === 'cancel' && onCancel) onCancel()
      else onClose()
    },
    [confirmDismiss, onCancel, onClose],
  )

  const { onBackdropClick } = useModalDialog(ref, {
    onClose: () => dismiss('close'),
    modal,
    dismissOnBackdrop: modal,
    initialFocus: (dialog) =>
      initialFocusRef?.current ??
      dialog.querySelector<HTMLElement>(`.sheet__body ${INTERACTIVE_SELECTOR}, .sheet__footer ${INTERACTIVE_SELECTOR}`) ??
      dialog.querySelector<HTMLElement>('.sheet__title'),
  })

  useFooterFlow(panelRef, bodyRef)
  const anchorRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => inheritScheme(anchorRef.current, ref.current), [])

  const hasFooter = Boolean(footer || onCancel || submit)
  const showClose = closeButton && !onCancel

  const sheet = (
    <dialog
      ref={ref}
      className="sheet"
      data-modal={modal ? undefined : 'false'}
      data-size={size === 'auto' ? undefined : size}
      aria-labelledby={context ? `${contextId} ${titleId}` : titleId}
      {...{ [PRIMARY_SCOPE_ATTR]: '' }}
      onClick={(e: MouseEvent<HTMLDialogElement>) => {
        onBackdropClick(e)
        if (modal) stopReactPropagation(e)
      }}
      onPointerDown={modal ? stopReactPropagation : undefined}
      onKeyDown={modal ? stopReactPropagation : undefined}
    >
      <div ref={panelRef} className="sheet__panel">
        <span className="sheet__grip" aria-hidden="true" />
        <header className="sheet__header">
          {context ? (
            <div className="sheet__heading">
              <p id={contextId} className="sheet__context">
                {context}
              </p>
              <h2 id={titleId} className="sheet__title" tabIndex={-1}>
                {title}
              </h2>
            </div>
          ) : (
            <h2 id={titleId} className="sheet__title" tabIndex={-1}>
              {title}
            </h2>
          )}
          {showClose ? <CloseButton onClick={() => dismiss('close')} /> : null}
        </header>
        <div ref={bodyRef} className="sheet__body">
          {children}
        </div>
        {hasFooter ? (
          <div className="sheet__footer" data-cancel={onCancel ? '' : undefined}>
            <ActionSurface>
              {onCancel ? (
                <Button variant="secondary" className="sheet__cancel" onClick={() => dismiss('cancel')} {...cancelProps}>
                  {cancelLabel}
                </Button>
              ) : null}
              {footer}
              {submit ? (
                <Button type="submit" form={submit.form} variant={submit.tone === 'danger' ? 'danger' : 'primary'} disabled={submit.disabled} loading={submit.loading} className="sheet__submit">
                  {submit.label}
                </Button>
              ) : null}
            </ActionSurface>
          </div>
        ) : null}
      </div>
      {asking ? (
        <Dialog
          open
          title={sheetStrings.discardTitle}
          onClose={() => setAsking(null)}
          onCancel={() => setAsking(null)}
          cancelLabel={sheetStrings.keepEditing}
          cancelProps={{ 'data-autofocus': true }}
          actions={
            <Button
              variant="danger"
              onClick={() => {
                const kind = asking
                setAsking(null)
                if (kind === 'cancel' && onCancel) onCancel()
                else onClose()
              }}
            >
              {sheetStrings.discard}
            </Button>
          }
        />
      ) : null}
    </dialog>
  )

  if (!modal) return sheet
  return (
    <>
      <span ref={anchorRef} hidden />
      {createPortal(sheet, document.body)}
    </>
  )
}

/**
 * SHORT-02 rule 5: sets data-footer="flow" on the panel while the body would show less than 40 % of it (footerShouldFlow). In flow
 * mode the body is not a scroller, so the decision uses the height the body would have with the sticky footer: the panel's height
 * less everything that is not the body. Written to the DOM directly: React never renders the attribute.
 */
function useFooterFlow(panelRef: RefObject<HTMLDivElement | null>, bodyRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const panel = panelRef.current
    const body = bodyRef.current
    if (!panel || !body || typeof ResizeObserver !== 'function') return
    const decide = () => {
      const flowing = panel.dataset['footer'] === 'flow'
      const stickyBody = flowing ? panel.clientHeight - Math.max(0, panel.scrollHeight - body.offsetHeight) : body.clientHeight
      const flow = footerShouldFlow({ panel: panel.clientHeight, body: stickyBody, bodyScroll: body.scrollHeight })
      if (flow) panel.dataset['footer'] = 'flow'
      else delete panel.dataset['footer']
    }
    const observer = new ResizeObserver(decide)
    observer.observe(panel)
    observer.observe(body)
    if (body.firstElementChild) observer.observe(body.firstElementChild)
    return () => observer.disconnect()
  }, [panelRef, bodyRef])
}
