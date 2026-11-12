// Navigation destinations fixed by the shell. Features may only add menu items.
import type { IconName } from '../ui/icons'

export interface PrimaryNavItem {
  id: string
  label: string
  path: string
  icon: IconName
  /** The accent-filled Scan button (58 px in the bottom bar, 56 px in the rail). Not raised: it sits in the bar. */
  accent?: boolean
}

export interface NavItem {
  id: string
  label: string
  path: string
  /** Defaults to `chevron` when a feature leaves it out. */
  icon?: IconName
  order?: number
  placement: 'menu'
}

export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  { id: 'today', label: 'Today', path: '/', icon: 'today' },
  { id: 'plan', label: 'Plan', path: '/plan', icon: 'plan' },
  { id: 'pantry', label: 'Pantry', path: '/pantry', icon: 'stock' },
  { id: 'scan', label: 'Scan', path: '/scan', icon: 'scan', accent: true },
  { id: 'shop', label: 'Shop', path: '/shop', icon: 'shop' },
  { id: 'recipes', label: 'Recipes', path: '/recipes', icon: 'recipes' },
  { id: 'settings', label: 'Settings', path: '/settings', icon: 'settings' },
]

/** The side rail lists the destinations in the same order as the bottom bar. */
export const RAIL_NAV: readonly PrimaryNavItem[] = PRIMARY_NAV

/** The avatar menu: shortcuts only (Settings is a top-level destination, nav-even). */
export const MENU_NAV: readonly NavItem[] = [
  // B2: /board was linked from nowhere. It is a destination in its own right (a wall display), so it lives in the menu.
  { id: 'board', label: 'Kitchen board', path: '/board', icon: 'board', placement: 'menu' },
]

/** Icons registered for menu entries by id. beta.5: Ingredients, Products and Shops left the menu for Settings > Catalogue, so none is left. */
const MENU_ICONS: Readonly<Record<string, IconName>> = {}

/** The icon of a menu entry: its own, else the one registered for its id, else `chevron`. */
export function menuIconFor(item: Pick<NavItem, 'id' | 'icon'>): IconName {
  return item.icon ?? MENU_ICONS[item.id] ?? 'chevron'
}

/** Sorts menu entries by order (unordered last), then by label. Returns a new array. */
export function sortByOrder(items: readonly NavItem[]): NavItem[] {
  return [...items].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.label.localeCompare(b.label))
}
