// PhotoEditSheet: one picture, edited in a modal sheet over ImageEditor (free aspect, turns, Reset; Cancel and Use this in the footer).
// The sheet mounts only while open, so the draft starts again on every open (the whole picture, unturned).
import { useId, useState } from 'react'
import { BottomSheet } from '../BottomSheet'
import { ImageEditor } from './ImageEditor'
import { initialEdit, type ImageEdit } from './lib/edit'
import { imageEditorStrings as t } from './strings'
import './PhotoEditSheet.css'

export interface PhotoEditSheetProps {
  open: boolean
  /** The sheet's name (its heading), e.g. "Edit photo 2". */
  title: string
  /** The picture, in its own (un-turned) orientation. */
  src: string
  width: number
  height: number
  /** Smallest crop side in picture pixels (default 160, the read's minimum). */
  minSide?: number
  /** The edit is being applied: nothing can be changed, and Escape and Close do nothing. */
  busy?: boolean
  /** Use this: the draft, whatever it is. */
  onUse(edit: ImageEdit): void
  /** Cancel, Escape and Close: the draft is dropped. */
  onCancel(): void
}

export function PhotoEditSheet({ open, ...props }: PhotoEditSheetProps) {
  return open ? <PhotoEditSurface {...props} /> : null
}

/** Mounted while open, so its draft is the sheet's own and starts again on every open (the whole picture, unturned). */
function PhotoEditSurface({ title, src, width, height, minSide = 160, busy, onUse, onCancel }: Omit<PhotoEditSheetProps, 'open'>) {
  const [draft, setDraft] = useState<ImageEdit>(() => initialEdit({ width, height }, 'free'))
  const formId = useId()
  const cancel = () => {
    if (!busy) onCancel()
  }
  // VC2: Cancel and Use this are the sheet's footer, so it has no Close; Use this submits the body's form.
  return (
    <BottomSheet
      open
      title={title}
      onClose={cancel}
      onCancel={cancel}
      cancelLabel={t.cancel}
      cancelProps={{ disabled: busy }}
      submit={{ label: t.useThis, form: formId, disabled: busy }}
    >
      <form
        id={formId}
        className="photo-edit-sheet"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) onUse(draft)
        }}
      >
        <ImageEditor
          src={src}
          width={width}
          height={height}
          aspect="free"
          value={draft}
          onChange={setDraft}
          minSide={minSide}
          busy={busy}
          autoFocus
          onCancel={cancel}
        />
      </form>
    </BottomSheet>
  )
}
