import { Avatar } from '../../../ui'

export interface RequestAvatarProps {
  name: string
  /** The Google photo URL, or ''. */
  picture: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * The requester's photo, falling back to their initials when the image fails to load (decision A8). The shared
 * Avatar has no such fallback and web/src/ui is not ours, so the fallback lives here. STUB: passes straight through.
 */
export function RequestAvatar({ name, picture, size = 'md' }: RequestAvatarProps) {
  return <Avatar name={name} imageUrl={picture || undefined} size={size} />
}
