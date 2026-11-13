import { useState } from 'react'
import './Thumb.css'

export type ThumbSize = 40 | 48 | 72 | 'hero'

export interface ThumbProps {
  /** The name the Thumb stands for (an Ingredient, a Product). Required: without a Picture it draws its monogram. */
  name: string
  /** "/api/images/<id>" of an Ingredient's or a Product's Picture; absent or "" draws the monogram. */
  imageUrl?: string
  size?: ThumbSize
  /** When given it is the image's alt text; otherwise the thumb is decorative (the name is shown next to it). */
  label?: string
}

/**
 * The first letter of the first word that starts with a letter, upper-cased (`é` included); '' when there is none.
 * A word that starts with a number ("24-month") is skipped, so "24-month Parmigiano" gives P.
 */
export function monogramOf(name: string): string {
  const word = name.trim().split(/\s+/).find((w) => /^\p{L}/u.test(w))
  return word ? word[0]!.toLocaleUpperCase() : ''
}

/**
 * A Picture as a square thumb (`object-fit: cover`). Without a Picture, or after a load error (that address is remembered; a
 * different one retries), a monogram on the accent tone in the same box (docs/design/system.md 7): never an empty box.
 */
export function Thumb({ name, imageUrl, size = 40, label }: ThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string>()
  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <span className="thumb" data-size={size}>
        <img src={imageUrl} alt={label ?? ''} onError={() => setFailedUrl(imageUrl)} />
      </span>
    )
  }
  // Decorative beside its name, or, given a label, an image named by it (as a Picture would be).
  return (
    <span
      className="thumb"
      data-size={size}
      data-monogram="true"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="thumb__monogram">{monogramOf(name)}</span>
    </span>
  )
}
