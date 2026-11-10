import type { ReactNode } from 'react'

export interface FileDropProps {
  label: string
  /** Called with the accepted files (only the first when not `multiple`). */
  onFiles: (files: File[]) => void
  /** Files dropped or chosen that failed `accept`. */
  onReject?: (files: File[]) => void
  accept?: string
  multiple?: boolean
  /** Name of the file already chosen, shown under the zone. */
  fileName?: string
  helper?: string
  error?: string
  disabled?: boolean
}

/** STUB (WP4 designer). Dashed zone; a hidden native file input inside; drag and drop. */
export function FileDrop(_props: FileDropProps): ReactNode {
  throw new Error('not implemented')
}
