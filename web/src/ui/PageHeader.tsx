import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** The screen title, an h1 (title-1). */
  title: string
  subtitle?: string
  /** E.g. a back IconButton. */
  leading?: ReactNode
  /** Right-aligned actions (IconButtons, one Button). */
  actions?: ReactNode
}

/** STUB (WP3 designer). `<header>` with title, optional subtitle, leading and actions. */
export function PageHeader(_props: PageHeaderProps): never {
  throw new Error('not implemented')
}
