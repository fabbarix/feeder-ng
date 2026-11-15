// Which primary destination is the current one for a location (the bottom bar and the side rail). Plain TypeScript, no React.
import { crumbsFor } from './breadcrumbs'
import type { PrimaryNavItem } from './nav'

const normalise = (pathname: string): string => {
  const path = pathname.replace(/[?#].*$/, '')
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path
}

/**
 * True when `item` is the current destination at `pathname`: its own path, anything under it (TB-13: every destination but Today
 * owns its sub-pages, so the Recipe page and the editor make Recipes current), or a page whose breadcrumb trail starts at it. So the
 * Catalogue pages (/ingredients, /products, /supplies and their entities, under Settings > Catalogue) make Settings current, and
 * never leave the accent Scan button looking like the current one. Today is current on "/" only.
 */
export function isCurrentNav(item: Pick<PrimaryNavItem, 'id' | 'path'>, pathname: string): boolean {
  const path = normalise(pathname)
  if (path === item.path) return true
  if (item.path === '/') return false
  if (path.startsWith(`${item.path}/`)) return true
  return crumbsFor(path)[0]?.to === item.path
}

/** The current primary destination at `pathname`, or undefined (an unknown page). */
export function currentNavOf<T extends Pick<PrimaryNavItem, 'id' | 'path'>>(items: readonly T[], pathname: string): T | undefined {
  return items.find((item) => isCurrentNav(item, pathname))
}
