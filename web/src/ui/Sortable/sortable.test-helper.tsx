// Shared by the Sortable component tests: a demo list, row rects (jsdom does not lay out) and pointer events.
import { fireEvent } from '@testing-library/react'
import { Sortable } from './Sortable'

export const ROW = 50

/** Gives each sortable item the rect of its ORIGINAL slot (index * ROW), the way the layout was when the drag began. */
export function layoutRows(root: ParentNode = document): void {
  for (const li of root.querySelectorAll<HTMLElement>('[data-sortable-item]')) {
    const i = Number(li.dataset['sortableIndex'])
    li.getBoundingClientRect = () =>
      ({ top: i * ROW, bottom: i * ROW + ROW, left: 0, right: 300, width: 300, height: ROW, x: 0, y: i * ROW, toJSON: () => ({}) }) as DOMRect
  }
}

export interface PointerInit {
  clientX?: number
  clientY?: number
  pointerId?: number
  pointerType?: 'mouse' | 'touch' | 'pen'
  button?: number
  /** Buttons held; defaults to 1 (primary) except on pointerup/pointercancel. */
  buttons?: number
}

/** Dispatches a pointer event (bubbling, cancelable) on `el`. */
export function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', init: PointerInit = {}): void {
  fireEvent(
    el,
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      clientX: 0,
      clientY: 0,
      ...init,
    }),
  )
}

export function Demo({
  items = ['garlic', 'flour', 'salt'],
  onReorder = () => {},
  disabled,
  as,
}: {
  items?: string[]
  onReorder?: (from: number, to: number) => void
  disabled?: boolean
  as?: 'ul' | 'ol'
}) {
  return (
    <Sortable
      items={items}
      as={as}
      aria-label="Ingredients"
      disabled={disabled}
      getKey={(s) => s}
      getLabel={(s) => s}
      onReorder={onReorder}
      renderItem={(s, { handle, itemProps }) => (
        <li {...itemProps}>
          {handle}
          <span>{s}</span>
        </li>
      )}
    />
  )
}

/** The names of the items in DOM order. */
export const shown = (root: ParentNode = document): string[] =>
  [...root.querySelectorAll('[data-sortable-item] > span')].map((n) => n.textContent ?? '')
