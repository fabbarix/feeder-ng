// pantry-filter: the Pantry's More menu: "Storage Places", a link to their settings (docs/design/pantry-filter.md 2.7). A popover from
// 768 px, the "More actions" sheet below (the shared Menu).
import type { ReactNode } from 'react'
import { Menu } from '../../../ui'
import { stockStrings as strings } from '../strings'

export function PantryOverflowMenu(): ReactNode {
  return <Menu label={strings.filterBar.more} items={[{ id: 'storage-places', label: strings.managePlaces, icon: 'settings', href: '/settings/storage-places' }]} />
}
