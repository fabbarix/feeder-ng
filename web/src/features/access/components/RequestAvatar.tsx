import { Avatar } from '../../../ui'

export interface RequestAvatarProps {
  name: string
  /** The Google photo URL, or ''. */
  picture: string
  size?: 'sm' | 'md' | 'lg'
}

/** The requester's photo; the shared Avatar falls back to their initials when it fails to load (decision A8). */
export function RequestAvatar({ name, picture, size = 'md' }: RequestAvatarProps) {
  return <Avatar name={name} imageUrl={picture || undefined} size={size} />
}
