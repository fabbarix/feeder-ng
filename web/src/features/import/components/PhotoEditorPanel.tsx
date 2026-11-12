// PhotoEditorPanel: the inline editor of one photo (docs/dev/design/photo-read.md D10, section 5 "PhotoEditorPanel", section 6 "Editor").
import { useEffect, useRef, type ReactNode } from 'react'
import { Button, ImageEditor, type ImageEdit, type Size } from '../../../ui'
import { READ_MIN_CROP_PX, type EditSession } from '../lib/photoPages'
import { photoReadStrings as t } from '../strings'

export interface PhotoEditorPanelProps {
  session: EditSession
  /** 1-based position ("Edit photo n"). */
  number: number
  /** The working copy's URL and size (the editor works on it). */
  src: string
  size: Size
  /** isSmallPhoto(draftOutputSize): the editor's warning. */
  small: boolean
  /** The photo was just taken with the camera: Retake is offered instead of Cancel. */
  canRetake: boolean
  onChange: (draft: ImageEdit) => void
  onUse: () => void
  onCancel: () => void
  onRetake: () => void
}

export function PhotoEditorPanel({ session, number, src, size, small, canRetake, onChange, onUse, onCancel, onRetake }: PhotoEditorPanelProps): ReactNode {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <section className="photo-editor">
      <h3 ref={heading} tabIndex={-1} className="photo-editor__title">
        {t.editHeading(number)}
      </h3>
      <ImageEditor
        src={src}
        width={size.width}
        height={size.height}
        aspect="free"
        value={session.draft}
        onChange={onChange}
        minSide={READ_MIN_CROP_PX}
        onCancel={onCancel}
      >
        <Button variant="primary" onClick={onUse}>
          {t.usePhoto}
        </Button>
        {canRetake ? (
          <Button variant="secondary" onClick={onRetake}>
            {t.retake}
          </Button>
        ) : (
          <Button variant="tertiary" onClick={onCancel}>
            {t.cancel}
          </Button>
        )}
      </ImageEditor>
      {small ? <p className="photo-editor__note">{t.small}</p> : null}
    </section>
  )
}
