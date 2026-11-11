// Accessibility contract of ui/Sortable (docs/dev/design/sort-drag.md sections 2.2, 4 and 5).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Demo, layoutRows, shown } from './sortable.test-helper'

const view = (over: Parameters<typeof Demo>[0] = {}) => {
  const out = render(<Demo {...over} />)
  layoutRows(out.container)
  return out
}

describe('Sortable: handle', () => {
  it('is a real button named "Reorder <item>" with the instructions as its description', () => {
    view()
    for (const name of ['garlic', 'flour', 'salt']) {
      const handle = screen.getByRole('button', { name: `Reorder ${name}` })
      expect(handle).toHaveAttribute('type', 'button')
      expect(handle).toHaveAttribute('aria-pressed', 'false')
      expect(handle).toHaveAccessibleDescription('Press Space to pick up, the arrow keys to move, Space to drop and Escape to cancel.')
    }
  })
  it('all handles share one instructions element, present once in the DOM', () => {
    view()
    const ids = screen.getAllByRole('button').map((b) => b.getAttribute('aria-describedby'))
    expect(new Set(ids).size).toBe(1)
    expect(document.querySelectorAll(`[id="${ids[0]}"]`)).toHaveLength(1)
  })
  it('shows a decorative drag glyph', () => {
    view()
    const svg = screen.getByRole('button', { name: 'Reorder garlic' }).querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
  it('is native-free: no HTML5 draggable attribute (pointer events only)', () => {
    const { container } = view()
    expect(container.querySelector('[draggable]')).toBeNull()
  })
  it('is disabled with the list', () => {
    view({ disabled: true })
    expect(screen.getByRole('button', { name: 'Reorder garlic' })).toBeDisabled()
  })
})

describe('Sortable: list', () => {
  it('is a list named by its aria-label, a ul unless `as` says ol', () => {
    const { rerender } = view()
    expect(screen.getByRole('list', { name: 'Ingredients' }).tagName).toBe('UL')
    rerender(<Demo as="ol" />)
    expect(screen.getByRole('list', { name: 'Ingredients' }).tagName).toBe('OL')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
  it('has one polite, atomic live region that starts empty', () => {
    view()
    const live = screen.getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveAttribute('aria-atomic', 'true')
    expect(live).toHaveTextContent('')
  })
})

describe('Sortable: keyboard through the DOM', () => {
  it('lifts, moves, announces, keeps focus on the handle, and drops once', async () => {
    const onReorder = vi.fn()
    view({ onReorder })
    const user = userEvent.setup()
    screen.getByRole('button', { name: 'Reorder garlic' }).focus()
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Reorder garlic' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Picked up garlic. Position 1 of 3. Use the arrow keys to move, Space to drop, Escape to cancel.')
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('data-state', 'lifted')
    await user.keyboard('{ArrowDown}')
    expect(shown()).toEqual(['flour', 'garlic', 'salt'])
    expect(screen.getByRole('button', { name: 'Reorder garlic' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('garlic moved to position 2 of 3.')
    await user.keyboard(' ')
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(0, 1)
    expect(screen.getByRole('status')).toHaveTextContent('Dropped garlic at position 2 of 3.')
    expect(screen.getByRole('button', { name: 'Reorder garlic' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('Escape puts everything back and calls nothing', async () => {
    const onReorder = vi.fn()
    view({ onReorder })
    const user = userEvent.setup()
    screen.getByRole('button', { name: 'Reorder flour' }).focus()
    await user.keyboard(' {ArrowUp}')
    expect(shown()).toEqual(['flour', 'garlic', 'salt'])
    await user.keyboard('{Escape}')
    expect(shown()).toEqual(['garlic', 'flour', 'salt'])
    expect(onReorder).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Reordering cancelled. flour stays at position 2 of 3.')
    expect(screen.getByRole('button', { name: 'Reorder flour' })).toHaveFocus()
  })
  it('Tab away cancels the lift', async () => {
    const onReorder = vi.fn()
    view({ onReorder })
    const user = userEvent.setup()
    screen.getByRole('button', { name: 'Reorder garlic' }).focus()
    await user.keyboard(' {ArrowDown}{Tab}')
    expect(onReorder).not.toHaveBeenCalled()
    expect(shown()).toEqual(['garlic', 'flour', 'salt'])
  })
})
