import { Fragment, type ReactNode } from 'react'
import type { SortableItemProps, SortableItemState } from './useSortable'
import type { SortableStrings } from './strings'

export interface SortableRenderContext {
  /** Original index of the item (what callbacks must use). */
  index: number
  /** Where it is shown now: differs from `index` while another item is lifted or dragged. */
  position: number
  state: SortableItemState
  /** The drag handle button; place it inside the item. */
  handle: ReactNode
  /** Spread on the item's `<li>`: ref, data-state, data-sortable-*, the drag offset. */
  itemProps: SortableItemProps
}

export interface SortableProps<T> {
  items: readonly T[]
  getKey: (item: T) => string
  /** Name of the item for the handle ("Reorder garlic") and the announcements. */
  getLabel: (item: T, index: number) => string
  /** Called once on drop with the original and the final index. */
  onReorder: (from: number, to: number) => void
  renderItem: (item: T, ctx: SortableRenderContext) => ReactNode
  as?: 'ul' | 'ol'
  className?: string
  'aria-label'?: string
  disabled?: boolean
  strings?: SortableStrings
}

/** STUB (docs/dev/design/sort-drag.md): renders the items without handles, live region or instructions. */
export function Sortable<T>({ items, getKey, renderItem, as: Tag = 'ul', className, ...rest }: SortableProps<T>): ReactNode {
  return (
    <Tag className={className} aria-label={rest['aria-label']}>
      {items.map((item, index) => (
        <Fragment key={getKey(item)}>
          {renderItem(item, {
            index,
            position: index,
            state: 'idle',
            handle: null,
            itemProps: { ref: null, 'data-sortable-item': '', 'data-sortable-index': index, 'data-state': 'idle' },
          })}
        </Fragment>
      ))}
    </Tag>
  )
}
