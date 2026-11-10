import { useState, type ReactNode } from 'react'
import { Button, FileDrop, RecipeThumb, Tile } from '../../../ui'
import { recipeStrings } from '../strings'

export interface PhotoPickerProps {
  /** URL of the current photo, '' when there is none. */
  imageUrl: string
  uploading: boolean
  /** A message for the last upload that failed, or null. */
  error: string | null
  onFile: (file: File) => void
  onRemove: () => void
}

/** The Recipe photo: a Tile with its heading, a RecipeThumb preview, a FileDrop for images (a rejected file is an error, not an upload) and remove. The upload itself is the hook's job. */
export function PhotoPicker({ imageUrl, uploading, error, onFile, onRemove }: PhotoPickerProps): ReactNode {
  const [rejected, setRejected] = useState<string | null>(null)
  return (
    <Tile as="section" className="photo-picker">
      <h2>{recipeStrings.photo}</h2>
      {imageUrl ? <RecipeThumb name="" photoUrl={imageUrl} size="hero" label={recipeStrings.photo} /> : null}
      <FileDrop
        label={imageUrl ? recipeStrings.fields.replacePhoto : recipeStrings.fields.addPhoto}
        accept="image/*"
        disabled={uploading}
        error={rejected ?? error ?? undefined}
        onFiles={([file]) => {
          setRejected(null)
          onFile(file!)
        }}
        onReject={() => setRejected(recipeStrings.photoErrors.unsupported)}
      />
      {uploading ? <p role="status">{recipeStrings.fields.uploading}</p> : null}
      {imageUrl ? (
        <Button variant="tertiary" icon="delete" onClick={onRemove}>
          {recipeStrings.fields.removePhoto}
        </Button>
      ) : null}
    </Tile>
  )
}
