// B9-40 (PC-03): the whole Step photo, full screen, in our own modal <dialog> with the one round Close. Escape and Close shut it.
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseButton } from '../../../ui'
import { inheritScheme, stopReactPropagation } from '../../../ui/lib/portalStop'
import { useModalDialog } from '../../../ui/lib/useModalDialog'
import { cookStrings } from '../strings'

export interface StepPhotoDialogProps {
  open: boolean
  /** The photo's URL. */
  src: string
  /** The Step's number: names the dialog "Step 2 photo". */
  number: number
  onClose: () => void
}

/** Mounted only while open; portalled to document.body. Focus goes to Close and returns to the opener. */
export function StepPhotoDialog(props: StepPhotoDialogProps): ReactNode {
  return props.open ? <PhotoSurface {...props} /> : null
}

function PhotoSurface({ src, number, onClose }: StepPhotoDialogProps): ReactNode {
  const ref = useRef<HTMLDialogElement>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => inheritScheme(anchorRef.current, ref.current), [])
  const { onBackdropClick } = useModalDialog(ref, {
    onClose,
    dismissOnBackdrop: true,
    initialFocus: (dialog) => dialog.querySelector<HTMLElement>('.close-button'),
  })
  const name = cookStrings.photoTitle(number)
  return (
    <>
      <span ref={anchorRef} hidden />
      {createPortal(
        <dialog
          ref={ref}
          className="cook-photo-dialog"
          aria-label={name}
          onClick={(e) => {
            onBackdropClick(e)
            stopReactPropagation(e)
          }}
          onPointerDown={stopReactPropagation}
          onKeyDown={stopReactPropagation}
        >
          <img className="cook-photo-dialog__image" src={src} alt={name} />
          <CloseButton className="cook-photo-dialog__close" label={cookStrings.close} onClick={onClose} />
        </dialog>,
        document.body,
      )}
    </>
  )
}
