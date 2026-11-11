import type { ReactNode, Ref } from 'react'
import { Icon } from '../Icon'
import type { SortableStrings } from './strings'
import { useSortable, type SortableItemProps, type SortableItemState } from './useSortable'
import './Sortable.css'

export interface SortableRenderContext {
  /** Original index of the item (what callbacks must use). */
  index: number
  /** Where it is shown now: differs from `index` while another item is lifted or dragged. */
  position: number
  state: SortableItemState
  /** Where the item at this original index is shown now (for labels that name other items by their visible number). */
  positionOf: (index: number) => number
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
  /** The list element, for the owner to focus (e.g. when no item is left). */
  listRef?: Ref<HTMLElement>
  tabIndex?: number
}

/**
 * A reorderable list: a drag handle per item (pointer, touch and keyboard), a live region that announces every change and
 * one hidden instructions paragraph the handles point at. It only previews the order; the owner reorders on `onReorder`.
 * See docs/dev/design/sort-drag.md.
 */
export function Sortable<T>({
  items,
  getKey,
  getLabel,
  onReorder,
  renderItem,
  as: Tag = 'ul',
  className,
  disabled,
  strings,
  listRef,
  tabIndex,
  ...rest
}: SortableProps<T>): ReactNode {
  const sortable = useSortable({
    count: items.length,
    labelOf: (i) => getLabel(items[i] as T, i),
    onReorder,
    disabled,
    strings,
  })
  const position: number[] = []
  sortable.order.forEach((original, shown) => (position[original] = shown))
  return (
    <>
      <Tag
        ref={listRef as Ref<never>}
        tabIndex={tabIndex}
        className={className ? `sortable ${className}` : 'sortable'}
        aria-label={rest['aria-label']}
      >
        {sortable.order.map((i) => {
          const item = items[i] as T
          const itemProps = sortable.getItemProps(i)
          return (
            <ItemSlot key={getKey(item)}>
              {renderItem(item, {
                index: i,
                position: position[i] ?? i,
                positionOf: (original) => position[original] ?? original,
                state: itemProps['data-state'],
                itemProps,
                handle: (
                  <button className="sortable-handle" disabled={disabled} {...sortable.getHandleProps(i)}>
                    <Icon name="drag" size={20} />
                  </button>
                ),
              })}
            </ItemSlot>
          )
        })}
      </Tag>
      <p id={sortable.instructionsId} className="sortable__instructions">
        {sortable.instructions}
      </p>
      <div role="status" aria-live="polite" aria-atomic="true" className="sortable__live">
        {sortable.announcement}
      </div>
    </>
  )
}

/** Carries the key of an item without adding a DOM node of its own. */
function ItemSlot({ children }: { children: ReactNode }): ReactNode {
  return children
}
