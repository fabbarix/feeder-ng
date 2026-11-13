// The optional Picture (SR5, 13.5 step 4, 2.3): our Button opens the phone's camera through the shared hidden input; after the shot the
// Picture is shown with Retake in place of the Button.
import { useEffect, useRef } from 'react'
import { Button, ImageFileInput, Thumb, type ImageFileInputHandle } from '../../../ui'
import type { PictureState } from '../hooks/useNewProductPicture'
import { newProductStrings } from '../newProductStrings'
import './NewProductSheet.css'

export interface NewProductPictureProps {
  /** the phone rather than a computer: "Take a Picture" with the camera */
  coarse: boolean
  state: PictureState
  onPick: (file: File) => Promise<void>
  onPicking?: (picking: boolean) => void
}

export function NewProductPicture({ coarse, state, onPick, onPicking }: NewProductPictureProps) {
  const input = useRef<ImageFileInputHandle>(null)

  // The camera app's cancel fires on the hidden input, which does not bubble: a capture-phase listener on the document still sees it.
  useEffect(() => {
    const cancelled = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'file') onPicking?.(false)
    }
    document.addEventListener('cancel', cancelled, true)
    return () => document.removeEventListener('cancel', cancelled, true)
  }, [onPicking])

  const open = () => {
    onPicking?.(true)
    input.current?.open()
  }

  const chosen = (files: File[]) => {
    onPicking?.(false)
    const file = files[0]
    if (file) void onPick(file)
  }

  return (
    <div className="new-product__picture">
      <span className="new-product__label">{newProductStrings.pictureLabel}</span>
      {/* On a phone the shared input opens the rear camera app. */}
      <ImageFileInput ref={input} capture={coarse} onFiles={chosen} />
      {state.preview ? (
        <div className="new-product__preview">
          <Thumb name={newProductStrings.productName} imageUrl={state.preview} size="hero" label={newProductStrings.pictureAlt} />
        </div>
      ) : null}
      {state.preview ? <p className="new-product__hint">{newProductStrings.pictureCropped}</p> : <p className="new-product__hint">{newProductStrings.pictureOptional}</p>}
      {state.failed ? <p className="new-product__error">{newProductStrings.pictureFailed}</p> : null}
      <div>
        <Button variant="secondary" icon="camera" disabled={state.busy} onClick={open}>
          {state.preview ? newProductStrings.retake : coarse ? newProductStrings.takePicture : newProductStrings.choosePicture}
        </Button>
      </div>
    </div>
  )
}
