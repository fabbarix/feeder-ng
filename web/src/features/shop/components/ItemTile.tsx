import type { ListItem } from '../lib/lines'

export interface ItemTileProps {
  item: ListItem
  onTick: (item: ListItem) => void
  onUntick: (item: ListItem) => void
  /** extras only; Lines come from the plan and cannot be deleted */
  onDelete?: (item: ListItem) => void
}

/**
 * One list item as a Bento Tile (`ui/Tile`, tone neutral; data-state "open" | "done"): the title, the detail
 * ("1400 g · 2 × Mutti 700 g") and the cost ("$3.18" or "—"). A button named "Tick <title>" (aria-pressed false)
 * calls onTick; when ticked it is named "Untick <title>" (aria-pressed true) and calls onUntick; a ticked tile is
 * visually done. Extras (kind 'extra') also get a "Delete <title>" button when onDelete is given. Render and wire only.
 * Stub until implemented.
 */
export function ItemTile(props: ItemTileProps) {
  void props
  return null
}
