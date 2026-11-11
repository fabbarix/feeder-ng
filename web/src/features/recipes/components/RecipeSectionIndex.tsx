import type { ReactNode } from 'react'

export interface RecipeSectionIndexProps {
  /** Sections in page order: the id of each section element and its label. */
  sections: { id: string; label: string }[]
}

/** R2-1 stub (E-01): the sticky section index in the editor's left gutter from 1280 px. Not implemented yet. */
export function RecipeSectionIndex(_props: RecipeSectionIndexProps): ReactNode {
  return null
}
