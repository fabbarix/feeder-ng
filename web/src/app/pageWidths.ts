// R2-L: the ONE place that says how wide each route's page is. Plain TypeScript, no React. Design: docs/dev/design/r2l-page-layout.md.
// STUB (red tests first): the table is empty and every route answers 'default'.
export type PageWidth = 'narrow' | 'default' | 'wide' | 'full'

export interface RouteWidth {
  /** Route path pattern: static segments, ":id" params, or a trailing "/*" wildcard ("/settings/*"). */
  path: string
  width: PageWidth
}

export const ROUTE_WIDTHS: RouteWidth[] = []

/** The width of the page at `pathname` (query and hash ignored); chromeless routes are 'full'; unlisted routes are 'default'. */
export function pageWidthFor(_pathname: string): PageWidth {
  return 'default'
}

/** The table's own answer, or undefined when only the 'default' fallback would apply (used to prove every feature route is listed). */
export function explicitPageWidth(_pathname: string): PageWidth | undefined {
  return undefined
}
