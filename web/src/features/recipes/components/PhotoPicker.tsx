import type { ReactNode } from 'react'
import { CROP_ASPECTS, ImagePicker, Tile } from '../../../ui'
import { recipeStrings } from '../strings'

export interface PhotoPickerProps {
  /** The Recipe photo's image id, '' = none. */
  value: string
  onChange: (imageId: string) => void
}

/** The Recipe photo: a Tile around the shared ImagePicker (4:3). Upload, crop and errors are the picker's job. */
export function PhotoPicker({ value, onChange }: PhotoPickerProps): ReactNode {
  return (
    <Tile as="section" className="photo-picker">
      <ImagePicker label={recipeStrings.photo} value={value} onChange={onChange} aspect={CROP_ASPECTS.landscape} size="hero" />
    </Tile>
  )
}
