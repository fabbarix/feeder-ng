import { Button } from '../../Button'
import { ImageEditor } from '../../ImageEditor/ImageEditor'
import type { CropAspect, Rect } from '../../ImageEditor/lib/crop'
import { useCropper } from '../hooks/useCropper'
import { imagePickerStrings as t } from '../strings'

export interface CropEditorProps {
  /** Object URL (or URL) of the picture to crop. */
  src: string
  /** Original pixel size. */
  width: number
  height: number
  aspect: CropAspect
  busy?: boolean
  /** Focus the crop box when the editor opens (the picker does; the bare editor does not). */
  autoFocus?: boolean
  /** Use crop: the turns and crop to apply. Not called when nothing changed (then onCancel). */
  onApply: (result: { turns: 0 | 1 | 2 | 3; crop: Rect }) => void
  onCancel: () => void
}

/** The picker's crop panel: the shared ImageEditor with Cancel and Use crop. Escape cancels. */
export function CropEditor({ src, width, height, aspect, busy, autoFocus, onApply, onCancel }: CropEditorProps) {
  const cropper = useCropper({ width, height, aspect })

  const apply = () => {
    if (!cropper.changed) onCancel()
    else onApply({ turns: cropper.turns, crop: cropper.rect })
  }

  return (
    <ImageEditor src={src} width={width} height={height} aspect={aspect} value={cropper.edit} onChange={cropper.setEdit} busy={busy} autoFocus={autoFocus} onCancel={onCancel}>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>
        {t.cancel}
      </Button>
      <Button variant="primary" disabled={busy} onClick={apply}>
        {t.useCrop}
      </Button>
    </ImageEditor>
  )
}
