import { useState } from 'react'
import { Avatar } from '../../../ui'

export interface RequestAvatarProps {
  name: string
  /** The Google photo URL, or ''. */
  picture: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * The requester's photo, falling back to their initials when the image fails to load (decision A8). The shared
 * Avatar has no such fallback, so it lives here. A new photo address gets a new try.
 */
export function RequestAvatar({ name, picture, size = 'md' }: RequestAvatarProps) {
  const [failed, setFailed] = useState('')
  if (!picture || failed === picture) return <Avatar name={name} size={size} />
  return (
    <span className="access__photo" onErrorCapture={() => setFailed(picture)}>
      <Avatar name={name} imageUrl={picture} size={size} />
    </span>
  )
}
