import type { ReactNode } from 'react'
import { CROP_ASPECTS, ImagePicker } from '../../../ui'
import { recipeStrings } from '../strings'

export interface StepPhotoProps {
  /** The Step's image id, '' when it has no photo. */
  imageId: string
  onChange: (imageId: string) => void
}

/** One Step's photo: the shared ImagePicker at 72 px. Each picker keeps its own upload state, so one Step never affects another. */
export function StepPhoto({ imageId, onChange }: StepPhotoProps): ReactNode {
  return (
    <div className="step-card__photo">
      <ImagePicker label={recipeStrings.steps.image} value={imageId} onChange={onChange} size={72} aspect={CROP_ASPECTS.landscape} />
    </div>
  )
}
