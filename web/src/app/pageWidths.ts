// R2-L: the ONE place that says how wide each route's page is. Plain TypeScript, no React. Design: docs/dev/design/r2l-page-layout.md.
// The shell (AppShell) applies it; the layout guard (scripts/lib/page-layout-rules.mjs) checks the same table (contract test).
export type PageWidth = 'narrow' | 'default' | 'wide' | 'full'

export interface RouteWidth {
  /** Route path pattern: static segments, ":id" params, or a trailing "/*" wildcard ("/settings/*"). */
  path: string
  width: PageWidth
}

export const ROUTE_WIDTHS: RouteWidth[] = [
  { path: '/', width: 'default' },
  { path: '/stock', width: 'default' },
  { path: '/recipes/:id', width: 'default' },
  { path: '/recipes/:id/edit', width: 'default' },
  { path: '/recipes/new', width: 'default' },
  { path: '/plan', width: 'wide' },
  { path: '/recipes', width: 'wide' },
  { path: '/shop', width: 'wide' },
  { path: '/scan', width: 'narrow' },
  { path: '/recipes/import', width: 'narrow' },
  { path: '/recipes/export', width: 'narrow' },
  { path: '/ingredients', width: 'narrow' },
  { path: '/ingredients/:id', width: 'narrow' },
  { path: '/products', width: 'narrow' },
  { path: '/products/:id', width: 'narrow' },
  { path: '/settings', width: 'narrow' },
  { path: '/settings/*', width: 'narrow' },
  // Sign-in routes redirect to / when signed in; they are listed so that no feature route inherits the fallback unnoticed.
  { path: '/sign-in', width: 'default' },
  { path: '/not-invited', width: 'default' },
  { path: '/waiting-for-approval', width: 'default' },
  { path: '/board', width: 'full' },
  { path: '/cook/*', width: 'full' },
]

const segments = (path: string) => (path.split(/[?#]/)[0] ?? '').split('/').filter(Boolean)

/** Specificity of `pattern` for `actual` (higher wins), or null when it does not match: static > :id > wildcard. */
function score(pattern: string, actual: string[]): number | null {
  const parts = segments(pattern)
  const wildcard = parts[parts.length - 1] === '*'
  const fixed = wildcard ? parts.slice(0, -1) : parts
  if (wildcard ? actual.length < fixed.length : actual.length !== fixed.length) return null
  let statics = 0
  for (let i = 0; i < fixed.length; i++) {
    if (fixed[i]!.startsWith(':')) continue
    if (fixed[i] !== actual[i]) return null
    statics++
  }
  // Non-wildcard always beats wildcard; then more static segments; then fewer params.
  return (wildcard ? 0 : 1000) + statics * 10 + (fixed.length - statics === 0 ? 1 : 0)
}

/** The table's own answer, or undefined when only the 'default' fallback would apply (used to prove every feature route is listed). */
export function explicitPageWidth(pathname: string): PageWidth | undefined {
  const actual = segments(pathname)
  let best: { width: PageWidth; s: number } | undefined
  for (const r of ROUTE_WIDTHS) {
    const s = score(r.path, actual)
    if (s !== null && (!best || s > best.s)) best = { width: r.width, s }
  }
  return best?.width
}

/** The width of the page at `pathname` (query and hash ignored); chromeless routes are 'full'; unlisted routes are 'default'. */
export function pageWidthFor(pathname: string): PageWidth {
  return explicitPageWidth(pathname) ?? 'default'
}
