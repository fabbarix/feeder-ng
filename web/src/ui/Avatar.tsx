import { useState, type CSSProperties } from 'react'
import { initials } from '../lib/format'
import './Avatar.css'

export interface AvatarProps {
  name: string
  imageUrl?: string
  size?: 'sm' | 'md' | 'lg'
  /** WP3b: a Member's colour (a CSS colour value, e.g. the stored hex, or `var(--...)`) drawn as a 2 px ring. */
  colour?: string
  /** An emoji shown instead of the initials. */
  glyph?: string
}

/** A person's picture; when there is none, or it fails to load, the emoji (`glyph`) or their initials. A new address gets a new try. */
export function Avatar({ name, imageUrl, size = 'md', colour, glyph }: AvatarProps) {
  // The colour is data: it goes in a custom property, and the stylesheet draws it as a ring.
  const [failed, setFailed] = useState('')
  const ring = colour ? ({ '--avatar-colour': colour } as CSSProperties) : undefined
  const coloured = colour ? 'true' : undefined
  if (imageUrl && failed !== imageUrl) {
    return <img className="avatar" data-size={size} data-coloured={coloured} style={ring} src={imageUrl} alt={name} onError={() => setFailed(imageUrl)} />
  }
  return (
    <span className="avatar" data-size={size} data-coloured={coloured} style={ring} role="img" aria-label={name}>
      {glyph || initials(name)}
    </span>
  )
}
