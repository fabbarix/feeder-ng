import { useState, type ReactNode } from 'react'
import { Button, FileDrop, RecipeThumb, Tile } from '../../../ui'
import { recipeStrings } from '../strings'

export interface PhotoPickerProps {
  /** IM2: the Recipe photo's image id, '' = none. This and onChange are the whole API after the move to the shared ImagePicker. */
  value?: string
  onChange?: (imageId: string) => void
  /** @deprecated IM2 stub: the old FileDrop props go away when PhotoPicker wraps <ImagePicker> (docs/dev/design/im2-image-fields.md). */
  imageUrl?: string
  /** @deprecated see imageUrl. */
  uploading?: boolean
  /** @deprecated see imageUrl. */
  error?: string | null
  /** @deprecated see imageUrl. */
  onFile?: (file: File) => void
  /** @deprecated see imageUrl. */
  onRemove?: () => void
}

/** The Recipe photo: a Tile with its heading, a RecipeThumb preview, a FileDrop for images (a rejected file is an error, not an upload) and remove. The upload itself is the hook's job. */
export function PhotoPicker({ imageUrl = '', uploading = false, error = null, onFile, onRemove }: PhotoPickerProps): ReactNode {
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
          onFile?.(file!)
        }}
        onReject={() => setRejected(recipeStrings.photoErrors.unsupported)}
      />
      {uploading ? <p role="status">{recipeStrings.fields.uploading}</p> : null}
      {imageUrl ? (
        <Button variant="tertiary" icon="delete" onClick={() => onRemove?.()}>
          {recipeStrings.fields.removePhoto}
        </Button>
      ) : null}
    </Tile>
  )
}
