import type { CSSProperties, KeyboardEvent, PointerEvent, Ref } from 'react'
import type { SortableStrings } from './strings'

export type SortableItemState = 'idle' | 'lifted' | 'dragging'

export type SortablePhase =
  | { phase: 'idle' }
  | { phase: 'lifted' | 'dragging'; from: number; to: number }

export interface UseSortableOptions {
  count: number
  /** Name of the item at this original index, used by the handle label and every announcement. */
  labelOf: (index: number) => string
  /** Called once, on drop, when the item ended somewhere else. Never called on cancel. */
  onReorder: (from: number, to: number) => void
  strings?: SortableStrings
  disabled?: boolean
  /** Element that scrolls the list; default: the nearest scrollable ancestor of the list, else the window. */
  getScrollParent?: () => HTMLElement | null
}

export interface SortableHandleProps {
  ref: Ref<HTMLButtonElement>
  type: 'button'
  'aria-label': string
  'aria-describedby': string
  'aria-pressed': boolean
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  onBlur: () => void
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => void
  onContextMenu: (e: { preventDefault: () => void }) => void
}

export interface SortableItemProps {
  ref: Ref<HTMLLIElement>
  'data-sortable-item': ''
  'data-sortable-index': number
  'data-state': SortableItemState
  style?: CSSProperties
}

export interface UseSortableResult {
  state: SortablePhase
  /** Original indices in the order they are shown now (the preview while lifted or dragging). */
  order: number[]
  /** The sentence for the live region. */
  announcement: string
  instructionsId: string
  instructions: string
  getHandleProps: (index: number) => SortableHandleProps
  getItemProps: (index: number) => SortableItemProps
}

/** STUB (docs/dev/design/sort-drag.md): inert, so the tests are red until the Developer implements it. */
export function useSortable(opts: UseSortableOptions): UseSortableResult {
  const inert = () => {}
  return {
    state: { phase: 'idle' },
    order: Array.from({ length: opts.count }, (_, i) => i),
    announcement: '',
    instructionsId: '',
    instructions: '',
    getHandleProps: (index) => ({
      ref: null,
      type: 'button',
      'aria-label': opts.labelOf(index),
      'aria-describedby': '',
      'aria-pressed': false,
      onKeyDown: inert,
      onBlur: inert,
      onPointerDown: inert,
      onPointerMove: inert,
      onPointerUp: inert,
      onPointerCancel: inert,
      onContextMenu: inert,
    }),
    getItemProps: (index) => ({ ref: null, 'data-sortable-item': '', 'data-sortable-index': index, 'data-state': 'idle' }),
  }
}
