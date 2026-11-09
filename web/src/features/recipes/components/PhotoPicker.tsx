import type { ReactNode } from 'react'
import { Button } from '../../../ui'
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

/** The Recipe photo: preview, a file chooser (images only) and remove. The upload itself is the hook's job. */
export function PhotoPicker({ imageUrl, uploading, error, onFile, onRemove }: PhotoPickerProps): ReactNode {
  return (
    <div>
      <h2>{recipeStrings.photo}</h2>
      {imageUrl ? <img src={imageUrl} alt="" className="recipe-photo" /> : null}
      <label>
        {imageUrl ? recipeStrings.fields.replacePhoto : recipeStrings.fields.addPhoto}
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
        />
      </label>
      {uploading ? <p role="status">{recipeStrings.fields.uploading}</p> : null}
      {imageUrl ? (
        <Button variant="ghost" onClick={onRemove}>
          {recipeStrings.fields.removePhoto}
        </Button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  )
}
