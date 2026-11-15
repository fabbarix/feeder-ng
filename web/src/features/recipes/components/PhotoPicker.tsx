import { useState, type ReactNode } from 'react'
import { BottomSheet, CROP_ASPECTS, Icon, ImagePicker } from '../../../ui'
import { recipeStrings } from '../strings'

export interface PhotoPickerProps {
  /** The Recipe photo's image id, '' = none. */
  value: string
  onChange: (imageId: string) => void
  /** PE: true while the picker uploads (the editor holds Save). */
  onBusyChange?: (busy: boolean) => void
}

/**
 * RX-02: the Recipe photo as one 96 px button beside the Name ("Photo of the Recipe: add" or "…: change"). It opens the shared
 * ImagePicker (4:3) in a sheet named "Photo" (a centred dialog from 768 px); upload, crop and errors are the picker's job.
 */
export function PhotoPicker({ value, onChange, onBusyChange }: PhotoPickerProps): ReactNode {
  const f = recipeStrings.fields
  const [open, setOpen] = useState(false)
  const has = value !== ''
  return (
    <>
      <button type="button" className="recipe-photo" aria-label={f.photoButton(has)} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {has ? <img className="recipe-photo__image" src={`/api/images/${value}`} alt="" /> : null}
        <span className="recipe-photo__label" aria-hidden="true">
          <Icon name="camera" size={16} />
          {has ? f.photoChange : f.photoAdd}
        </span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={recipeStrings.photo}>
        <div className="photo-picker">
          <ImagePicker hideLabel label={recipeStrings.photo} value={value} onChange={onChange} onBusyChange={onBusyChange} aspect={CROP_ASPECTS.landscape} size="hero" />
        </div>
      </BottomSheet>
    </>
  )
}
