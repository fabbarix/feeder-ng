// The avatar-menu entry for pending Access Requests (A1). Plain TypeScript.
import { ACCESS_REQUESTS_PATH } from '../features/access/lib/paths'
import { accessStrings } from '../features/access/strings'
import type { NavItem } from './nav'

/** Adds "Sign-in requests" before a Settings entry (if the menu has one), else last, while `count` is above 0; `items` otherwise. */
export function withAccessRequests(items: NavItem[], count: number): NavItem[] {
  if (count <= 0) return items
  const entry: NavItem = { id: 'access-requests', label: accessStrings.menuItem, path: ACCESS_REQUESTS_PATH, icon: 'allowlist', placement: 'menu' }
  const at = items.findIndex((i) => i.id === 'settings')
  return at < 0 ? [...items, entry] : [...items.slice(0, at), entry, ...items.slice(at)]
}
