import type { ReactNode } from 'react'
import type { Photo } from '../lib/photoPages'

export interface PhotoRowProps {
  photo: Photo
  /** 1-based position ("Photo n"). */
  number: number
  previewUrl: string | undefined
  /** Sortable's drag handle. */
  handle?: ReactNode
  disabled?: boolean
  onEdit: () => void
  onRemove: () => void
}

/** STUB. */
export function PhotoRow(_props: PhotoRowProps): ReactNode {
  return null
}
