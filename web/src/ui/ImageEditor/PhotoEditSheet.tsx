// PhotoEditSheet: one picture, edited in a modal sheet over ImageEditor (free aspect, turns, Reset, Cancel, Use this).
// The sheet mounts only while open, so the draft starts again on every open (the whole picture, unturned).
import { useState } from 'react'
import { BottomSheet } from '../BottomSheet'
import { Button } from '../Button'
import { ImageEditor } from './ImageEditor'
import { initialEdit, type ImageEdit } from './lib/edit'
import { imageEditorStrings as t } from './strings'

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

export function PhotoEditSheet({ open, title, src, width, height, minSide = 160, busy, onUse, onCancel }: PhotoEditSheetProps) {
  const cancel = () => {
    if (!busy) onCancel()
  }
  return (
    <BottomSheet open={open} title={title} onClose={cancel}>
      <PhotoEditBody src={src} width={width} height={height} minSide={minSide} busy={busy} onUse={onUse} onCancel={cancel} />
    </BottomSheet>
  )
}

interface PhotoEditBodyProps {
  src: string
  width: number
  height: number
  minSide: number
  busy?: boolean
  onUse(edit: ImageEdit): void
  onCancel(): void
}

/** Mounted with the sheet, so its draft is the sheet's own and starts again on every open. */
function PhotoEditBody({ src, width, height, minSide, busy, onUse, onCancel }: PhotoEditBodyProps) {
  const [draft, setDraft] = useState<ImageEdit>(() => initialEdit({ width, height }, 'free'))
  return (
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
      onCancel={onCancel}
    >
      <Button variant="tertiary" disabled={busy} onClick={onCancel}>
        {t.cancel}
      </Button>
      <Button variant="primary" disabled={busy} onClick={() => onUse(draft)}>
        {t.useThis}
      </Button>
    </ImageEditor>
  )
}
