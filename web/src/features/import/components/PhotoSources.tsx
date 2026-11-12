import type { ReactNode } from 'react'
import type { ImageOrigin } from '../../../ui'
import type { PhotoSourceOptions } from '../hooks/usePhotoSources'

export interface PhotoSourcesProps {
  options: PhotoSourceOptions
  /** false at 4 photos (or while a file is prepared): every source is off, with the reason as description. */
  canAdd: boolean
  disabled?: boolean
  /** 'camera' from the capture input, 'file' from the library / files input and the drop zone. */
  onFiles: (files: File[], origin: ImageOrigin) => void
}

/** STUB. */
export function PhotoSources(_props: PhotoSourcesProps): ReactNode {
  return null
}
