import type { ReactNode } from 'react'
import type { IconName } from '../icons'

/** One choice of a Menu. `href` makes it a link; `checked` makes it a checkable item (menuitemcheckbox). */
export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  tone?: 'danger'
  href?: string
  checked?: boolean
  disabled?: boolean
  onSelect?: () => void
}
export interface MenuSeparator {
  separator: true
}
export type MenuEntry = MenuItem | MenuSeparator

export interface MenuProps {
  /** The trigger's accessible name and the menu's name ("More actions"). */
  label: string
  /** Trigger glyph. Default `more`. */
  icon?: IconName
  /** Title of the sheet below 768 px. Default: `label`. */
  title?: string
  items: MenuEntry[]
}

/** R2-1 stub (G-01, docs/dev/design/r2-1-recipes.md section 2): a popover from 768 px, a BottomSheet below. Not implemented yet. */
export function Menu(_props: MenuProps): ReactNode {
  return null
}
