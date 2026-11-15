import type { ReactNode } from 'react'
import { CROP_ASPECTS, ImagePicker } from '../../../ui'
import { recipeStrings } from '../strings'

export interface StepPhotoProps {
  /** The Step's image id, '' when it has no photo. */
  imageId: string
  onChange: (imageId: string) => void
  /** PE: true while the picker uploads. */
  onBusyChange?: (busy: boolean) => void
}

/**
 * One Step's Photo (RX-02): the shared ImagePicker in its compact mode (B9-30): the 72 px picture with Change and Remove, or, before a
 * Photo is chosen, "No Photo yet." with Choose a file (and Take photo where there is a camera). Each picker keeps its own upload state,
 * so one Step never affects another.
 */
export function StepPhoto({ imageId, onChange, onBusyChange }: StepPhotoProps): ReactNode {
  return (
    <div className="step-card__photo">
      <ImagePicker
        compact
        hideLabel
        label={recipeStrings.steps.image}
        noun={recipeStrings.photo}
        helper={recipeStrings.steps.noPhotoYet}
        value={imageId}
        onChange={onChange}
        onBusyChange={onBusyChange}
        size={72}
        aspect={CROP_ASPECTS.landscape}
      />
    </div>
  )
}
