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

/** Set by the outermost Page: a Page inside a Page renders no second container. */
const InsidePage = createContext(false)

export interface PageProps {
  /** Overrides the route's width. Omit inside the shell. */
  width?: PageWidth
  /** A PageHeader, rendered above the body. */
  header?: ReactNode
  children?: ReactNode
}

/** The one width container of a screen: centred, content width from the route table plus the page gutters. */
export function Page({ width, header, children }: PageProps) {
  const inherited = useContext(PageWidthContext)
  const nested = useContext(InsidePage)
  const content = (
    <>
      {header ? <div className="page__header">{header}</div> : null}
      <div className="page__body">{children}</div>
    </>
  )
  if (nested) return content
  return (
    <InsidePage.Provider value>
      <div className="page" data-page-width={width ?? inherited ?? 'default'}>
        {content}
      </div>
    </InsidePage.Provider>
  )
}
