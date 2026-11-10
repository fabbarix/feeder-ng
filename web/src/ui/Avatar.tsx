import { initials } from '../lib/format'
import './Avatar.css'

export interface AvatarProps {
  name: string
  imageUrl?: string
  size?: 'sm' | 'md' | 'lg'
}

/** A person's picture, or their initials when there is no picture. */
export function Avatar({ name, imageUrl, size = 'md' }: AvatarProps) {
  if (imageUrl) {
    return <img className="avatar" data-size={size} src={imageUrl} alt={name} />
  }
  return (
    <span className="avatar" data-size={size} role="img" aria-label={name}>
      {initials(name)}
    </span>
  )
}
