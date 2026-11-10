import type { ReactNode } from 'react'
import { Button, FileDrop, RecipeThumb } from '../../../ui'
import { usePhotoUpload } from '../hooks/usePhotoUpload'
import { recipeStrings } from '../strings'

export interface StepPhotoProps {
  /** The Step's image id, '' when it has no photo. */
  imageId: string
  onChange: (imageId: string) => void
}

/**
 * One Step's photo: the thumb, a FileDrop and remove. Each StepPhoto holds its own usePhotoUpload state, so one
 * Step's upload never shows on another Step or on the Recipe photo.
 */
export function StepPhoto({ imageId, onChange }: StepPhotoProps): ReactNode {
  const photo = usePhotoUpload()
  const onFile = async (file: File) => {
    const id = await photo.upload(file)
    if (id) onChange(id)
  }
  return (
    <div className="step-card__photo">
      {imageId ? <RecipeThumb name="" photoUrl={`/api/images/${imageId}`} size={72} label={recipeStrings.steps.image} /> : null}
      <FileDrop
        label={imageId ? recipeStrings.fields.replacePhoto : recipeStrings.steps.image}
        accept="image/*"
        disabled={photo.uploading}
        error={photo.error ?? undefined}
        onFiles={([file]) => void onFile(file!)}
      />
      {imageId ? (
        <Button variant="tertiary" icon="delete" onClick={() => onChange('')}>
          {recipeStrings.steps.removeImage}
        </Button>
      ) : null}
    </div>
  )
}
