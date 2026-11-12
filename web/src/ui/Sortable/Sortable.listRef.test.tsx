// Sortable's `listRef` and `tabIndex`: the owner can reach the list element and make it focusable.
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { Sortable } from './Sortable'

const list = (extra: { listRef?: React.Ref<HTMLElement>; tabIndex?: number }) => (
  <Sortable
    items={['a', 'b']}
    aria-label="Letters"
    getKey={(s) => s}
    getLabel={(s) => s}
    onReorder={() => {}}
    renderItem={(s, { handle, itemProps }) => (
      <li {...itemProps}>
        {handle}
        {s}
      </li>
    )}
    {...extra}
  />
)

describe('Sortable: listRef and tabIndex', () => {
  it('listRef reaches the list element', () => {
    const ref = createRef<HTMLElement>()
    render(list({ listRef: ref }))
    expect(ref.current).toBe(screen.getByRole('list', { name: 'Letters' }))
  })
  it('renders tabIndex=-1 when given and no tabindex otherwise', () => {
    const { rerender } = render(list({ tabIndex: -1 }))
    expect(screen.getByRole('list', { name: 'Letters' })).toHaveAttribute('tabindex', '-1')
    rerender(list({}))
    expect(screen.getByRole('list', { name: 'Letters' })).not.toHaveAttribute('tabindex')
  })
})
