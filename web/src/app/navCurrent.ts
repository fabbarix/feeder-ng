// Which primary destination is the current one for a location (the bottom bar and the side rail). Plain TypeScript, no React.
import { crumbsFor } from './breadcrumbs'
import type { PrimaryNavItem } from './nav'

/** Plan and Settings own their sub-pages (/plan/..., /settings/...); the other destinations match exactly. */
const OWNS_SUBPAGES = new Set(['plan', 'settings'])

const normalise = (pathname: string): string => {
  const path = pathname.replace(/[?#].*$/, '')
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path
}

/**
 * True when `item` is the current destination at `pathname`: its own path (and, for Plan and Settings, anything under it), or a
 * page whose breadcrumb trail starts at it. So the Catalogue pages (/ingredients, /products, /supplies and their entities, under
 * Settings > Catalogue) make Settings current, and never leave the accent Scan button looking like the current one.
 */
export function isCurrentNav(item: Pick<PrimaryNavItem, 'id' | 'path'>, pathname: string): boolean {
  const path = normalise(pathname)
  if (path === item.path) return true
  if (OWNS_SUBPAGES.has(item.id) && path.startsWith(`${item.path}/`)) return true
  return OWNS_SUBPAGES.has(item.id) && crumbsFor(path)[0]?.to === item.path
}
