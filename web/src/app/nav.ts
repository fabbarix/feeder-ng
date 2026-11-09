// Navigation destinations fixed by the shell. Features may only add menu items.
export interface PrimaryNavItem {
  id: string
  label: string
  path: string
  /** The raised centre button of the phone bottom bar. */
  raised?: boolean
}

export interface NavItem {
  id: string
  label: string
  path: string
  order?: number
  placement: 'menu'
}

export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  { id: 'today', label: 'Today', path: '/' },
  { id: 'plan', label: 'Plan', path: '/plan' },
  { id: 'scan', label: 'Scan', path: '/scan', raised: true },
  { id: 'shop', label: 'Shop', path: '/shop' },
  { id: 'recipes', label: 'Recipes', path: '/recipes' },
]

export const MENU_NAV: readonly NavItem[] = [
  { id: 'stock', label: 'Stock', path: '/stock', placement: 'menu' },
  { id: 'settings', label: 'Settings', path: '/settings', placement: 'menu' },
]

/** Sorts menu entries by order (unordered last), then by label. Returns a new array. */
export function sortByOrder(items: readonly NavItem[]): NavItem[] {
  return [...items].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.label.localeCompare(b.label))
}
