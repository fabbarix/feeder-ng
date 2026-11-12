import type { ReactNode } from 'react'
import type { Photo, PhotoId } from '../lib/photoPages'

export interface PhotoListProps {
  photos: Photo[]
  previewUrl: (id: PhotoId) => string | undefined
  disabled?: boolean
  onEdit: (id: PhotoId) => void
  onRemove: (id: PhotoId) => void
  onMove: (from: number, to: number) => void
}

/** STUB. */
export function PhotoList(_props: PhotoListProps): ReactNode {
  return null
}
