import { Avatar } from '../../../ui'

export interface RequestAvatarProps {
  name: string
  /** The Google photo URL, or ''. */
  picture: string
  size?: 'sm' | 'md' | 'lg'
}

/** The requester's photo; the shared Avatar falls back to their initials when it fails to load (decision A8). A requester is not a
 *  Member, so the monogram is neutral (SET-12), never the accent fill. */
export function RequestAvatar({ name, picture, size = 'md' }: RequestAvatarProps) {
  return <Avatar name={name} imageUrl={picture || undefined} size={size} tone="neutral" />
}
