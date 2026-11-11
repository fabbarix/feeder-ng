import { useState } from 'react'
import './PictureThumb.css'

export interface PictureThumbProps {
  /** "/api/images/<id>" of the Picture; absent or "" draws the empty reserved slot. */
  imageUrl?: string
  size?: 40 | 48 | 72
}

/**
 * A Picture as a square thumb (`object-fit: cover`, decorative: the name is shown next to it). Without a Picture, or after a
 * load error, an empty reserved slot of the same box, so list names stay aligned.
 * TODO(pictures-everywhere): switch to the shared ui/Thumb once team R2-1 has merged and the primitive exists (see
 * docs/dev/design/pp-product-pictures.md), and move IngredientList to it too.
 */
export function PictureThumb({ imageUrl, size = 40 }: PictureThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string>()
  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <span className="picture-thumb" data-size={size}>
        <img src={imageUrl} alt="" onError={() => setFailedUrl(imageUrl)} />
      </span>
    )
  }
  return <span className="picture-thumb" data-size={size} aria-hidden="true" />
}
