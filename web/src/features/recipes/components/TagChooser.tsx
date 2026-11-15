import type { ReactNode } from 'react'
import type { TagCount } from '../types'

export interface TagChooserProps {
  tags: string[]
  onChange: (tags: string[]) => void
  /** The Household's existing Tags. */
  known?: TagCount[]
  /** Tag name => colour id; undefined = a new Tag (a neutral chip with "New"). Itself undefined while the Tags load: no "New" yet. */
  colourOf?: (name: string) => string | undefined
}

/** B9-37 stub (RX-09; pinned by TagChooser.test.tsx): removable Tag chips, "Add Tag", and the chooser (a sheet below 768 px, a popover from it). */
export function TagChooser(_props: TagChooserProps): ReactNode {
  throw new Error('B9-37: TagChooser is not built yet')
}
