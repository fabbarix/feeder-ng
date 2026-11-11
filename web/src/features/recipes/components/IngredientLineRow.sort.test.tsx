// Sort-drag: the ingredient line takes a drag handle and an actions menu (docs/dev/design/sort-drag.md section 6.1).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import type { LineDraft } from '../lib/draft'
import { IngredientLineRow, type IngredientLineRowProps } from './IngredientLineRow'

const line = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '', ...over,
})
const handle = <button type="button" aria-label="Reorder garlic">h</button>
const props = (over: Partial<IngredientLineRowProps> = {}): IngredientLineRowProps => ({
  line: line(), index: 1, errors: {}, ingredient: garlic, ingredients: [garlic, flour],
  onPick: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), handle, count: 3, onMove: vi.fn(), ...over,
})
const view = (p = props()) => {
  render(<ul><IngredientLineRow {...p} /></ul>)
  return p
}
const row = () => screen.getByRole('listitem')

describe('IngredientLineRow: drag handle', () => {
  it('puts the handle first in the Ingredient cell, ahead of the Ingredient picker', () => {
    view()
    const cell = row().querySelector('.line-row__ingredient')!
    const holder = cell.querySelector('.line-row__handle')
    expect(holder).not.toBeNull()
    expect(cell.firstElementChild).toBe(holder)
    expect(within(holder as HTMLElement).getByRole('button', { name: 'Reorder garlic' })).toBeInTheDocument()
    expect(holder!.compareDocumentPosition(within(cell as HTMLElement).getByRole('combobox', { name: 'Ingredient' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
  it('spreads the sortable item props on the row (state and drag offset)', () => {
    view(props({ itemProps: { ref: null, 'data-sortable-item': '', 'data-sortable-index': 1, 'data-state': 'dragging', style: { ['--sortable-dy' as string]: '12px' } } }))
    expect(row()).toHaveAttribute('data-state', 'dragging')
    expect(row()).toHaveAttribute('data-sortable-index', '1')
    expect(row().style.getPropertyValue('--sortable-dy')).toBe('12px')
  })
  it('a pending Ready Meal line can be reordered too', () => {
    view(props({ line: line({ auto: true, ingredientId: null, ingredientName: 'Aioli pack' }), ingredient: undefined }))
    expect(screen.getByRole('button', { name: 'Reorder garlic' })).toBeInTheDocument()
  })
  it('without a handle the row has no handle holder and its menu offers no Move items', async () => {
    view(props({ handle: undefined, onMove: undefined, count: undefined }))
    expect(row().querySelector('.line-row__handle')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    expect(screen.queryByRole('menuitem', { name: /^Move ingredient/ })).toBeNull()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Optional' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Remove ingredient garlic' })).toBeInTheDocument()
  })
})

describe('IngredientLineRow: actions menu (the accessible fallback)', () => {
  it('sits with the remove button, named for the line, and keeps Remove', () => {
    view()
    const cell = row().querySelector('.line-row__remove') as HTMLElement
    const trigger = within(cell).getByRole('button', { name: 'Actions for garlic' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(within(cell).getByRole('button', { name: 'Remove ingredient garlic' })).toBeInTheDocument()
  })
  it('is named by the line number while no Ingredient is picked', () => {
    view(props({ line: line({ ingredientId: null, ingredientName: '' }), ingredient: undefined }))
    expect(screen.getByRole('button', { name: 'Actions for line 2' })).toBeInTheDocument()
  })
  it('Move ingredient up and down call onMove with -1 and +1', async () => {
    const p = view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move ingredient up' }))
    expect(p.onMove).toHaveBeenLastCalledWith(-1)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move ingredient down' }))
    expect(p.onMove).toHaveBeenLastCalledWith(1)
  })
  it('the first line cannot go up and the last cannot go down', async () => {
    const { unmount } = render(<ul><IngredientLineRow {...props({ index: 0 })} /></ul>)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    expect(screen.getByRole('menuitem', { name: 'Move ingredient up' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'Move ingredient down' })).not.toHaveAttribute('aria-disabled', 'true')
    unmount()
    render(<ul><IngredientLineRow {...props({ index: 2 })} /></ul>)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    expect(screen.getByRole('menuitem', { name: 'Move ingredient down' })).toHaveAttribute('aria-disabled', 'true')
  })
  it('a disabled item does nothing when chosen', async () => {
    const p = props({ index: 0 })
    render(<ul><IngredientLineRow {...p} /></ul>)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move ingredient up' }))
    expect(p.onMove).not.toHaveBeenCalled()
  })
})
