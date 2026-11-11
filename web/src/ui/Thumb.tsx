import { useState } from 'react'
import './Thumb.css'

export type ThumbSize = 40 | 48 | 72 | 'hero'

export interface ThumbProps {
  /** "/api/images/<id>" of an Ingredient's or a Product's Picture; absent or "" draws the empty reserved slot. */
  imageUrl?: string
  size?: ThumbSize
  /** When given it is the image's alt text; otherwise the thumb is decorative (the name is shown next to it). */
  label?: string
}

/**
 * A Picture as a square thumb (`object-fit: cover`). Without a Picture, or after a load error (that address is remembered; a
 * different one retries), an empty reserved slot of the same box, so list names stay aligned.
 */
export function Thumb({ imageUrl, size = 40, label }: ThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string>()
  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <span className="thumb" data-size={size}>
        <img src={imageUrl} alt={label ?? ''} onError={() => setFailedUrl(imageUrl)} />
      </span>
    )
  }
  return <span className="thumb" data-size={size} aria-hidden="true" />
}
