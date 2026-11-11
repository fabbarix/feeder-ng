import { createContext, useContext, type ReactNode } from 'react'
import type { PageWidth } from '../app/pageWidths'
import './Page.css'

export type { PageWidth }

/** The width the shell resolved from the route table; `Page` uses it when it has no `width` prop. */
export const PageWidthContext = createContext<PageWidth | undefined>(undefined)
export const PageWidthProvider = PageWidthContext.Provider
export function usePageWidth(): PageWidth {
  return useContext(PageWidthContext) ?? 'default'
}

export interface PageProps {
  /** Overrides the route's width. Omit inside the shell. */
  width?: PageWidth
  /** A PageHeader, rendered above the body. */
  header?: ReactNode
  children?: ReactNode
}

/** STUB (R2-L red tests). */
export function Page({ children }: PageProps) {
  return <div>{children}</div>
}
