import type { Shop } from '../types'

export interface ShopListProps {
  shops: Shop[]
  isAdmin: boolean
  onAdd: (name: string) => Promise<void>
}

/** Tiles per Shop linking to /settings/shops/:id; EmptyState when none; an Admin also gets "Add Shop" (BottomSheet with a name field), a non-Admin sees strings.adminOnly instead. */
export function ShopList(props: ShopListProps): never {
  void props
  throw new Error('TODO')
}
