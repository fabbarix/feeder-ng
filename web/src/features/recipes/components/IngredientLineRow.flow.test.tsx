// B9-37 (RX-10, RX-02): "Optional" is a Checkbox on every line, not a checkable item of the ⋮ menu; the ⋮ menu holds Move up, Move down,
// Add note, the Base recipe link actions and Remove. A line's Note is always in the row (the phone's CSS hides it until the line has one:
// `data-has-note` on the <li> says which), and "Add note" reveals it and puts the cursor in it. Component-level; the editor-level flow
// (focus to Quantity after a pick, Enter adds a line) is in screens/RecipeEditorScreen.flow.test.tsx.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import type { LineDraft } from '../lib/draft'
import { IngredientLineRow, type IngredientLineRowProps } from './IngredientLineRow'

const line = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '', ...over,
})
const props = (over: Partial<IngredientLineRowProps> = {}): IngredientLineRowProps => ({
  line: line(), index: 0, errors: {}, ingredient: garlic, ingredients: [garlic, flour],
  onPick: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), onMove: vi.fn(), count: 2, ...over,
})
const view = (p = props()) => {
  const { container } = render(<ul><IngredientLineRow {...p} /></ul>)
  return { p, row: container.querySelector('li')! }
}
const openMenu = async (name = 'garlic') => {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  return screen.getByRole('menu')
}

describe('Optional is a checkbox on the line', () => {
  it('is a checkbox named "Optional: garlic" with the visible words "Optional"', () => {
    const { row } = view()
    const box = screen.getByRole('checkbox', { name: 'Optional: garlic' })
    expect(box).not.toBeChecked()
    expect(within(row).getByText('Optional')).toBeInTheDocument()
  })

  it('shows a ticked line as checked, and names a line with no Ingredient yet by its number', () => {
    view(props({ line: line({ optional: true }) }))
    expect(screen.getByRole('checkbox', { name: 'Optional: garlic' })).toBeChecked()
  })

  it('names a line before an Ingredient is picked "Optional: line 3"', () => {
    view(props({ index: 2, line: line({ ingredientId: null, ingredientName: '', unit: '' }), ingredient: undefined }))
    expect(screen.getByRole('checkbox', { name: 'Optional: line 3' })).toBeInTheDocument()
  })

  it('ticking it calls onChange({ optional: true })', async () => {
    const { p } = view()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Optional: garlic' }))
    expect(p.onChange).toHaveBeenCalledWith({ optional: true })
  })

  it('unticking a ticked line calls onChange({ optional: false })', async () => {
    const { p } = view(props({ line: line({ optional: true }) }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Optional: garlic' }))
    expect(p.onChange).toHaveBeenCalledWith({ optional: false })
  })

  it('the floating "Optional" chip beside the Ingredient is gone (the checkbox says it)', () => {
    const { row } = view(props({ line: line({ optional: true }) }))
    expect([...row.querySelectorAll('.chip')].filter((c) => c.textContent === 'Optional')).toHaveLength(0)
  })

  it('the ⋮ menu has no Optional item', async () => {
    view()
    const menu = await openMenu()
    expect(within(menu).queryByRole('menuitemcheckbox')).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: 'Optional' })).toBeNull()
  })
})

describe('the ⋮ menu of a line (RX-02)', () => {
  it('holds Move up, Move down, Add note and Remove', async () => {
    view()
    const menu = await openMenu()
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Move ingredient up', 'Move ingredient down', 'Add note', 'Remove ingredient garlic',
    ])
  })

  it('Move up is off on the first line, Move down on the last', async () => {
    view(props({ index: 0, count: 1 }))
    const menu = await openMenu()
    // The shared Menu keeps an off item focusable and says it with aria-disabled (as the other Menu tests check), not `disabled`.
    expect(within(menu).getByRole('menuitem', { name: 'Move ingredient up' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(menu).getByRole('menuitem', { name: 'Move ingredient down' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('Remove in the menu calls onRemove (a phone has no trash button beside the ⋮)', async () => {
    const { p } = view()
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Remove ingredient garlic' }))
    expect(p.onRemove).toHaveBeenCalledOnce()
  })

  it('a line that has a Note offers no "Add note"', async () => {
    view(props({ line: line({ note: 'finely sliced' }) }))
    const menu = await openMenu()
    expect(within(menu).queryByRole('menuitem', { name: 'Add note' })).toBeNull()
  })

  it('a plain line with an Ingredient keeps "Link to a Base recipe" (before Remove)', async () => {
    view(props({ onLinkToBase: vi.fn() }))
    const menu = await openMenu()
    expect(within(menu).getByRole('menuitem', { name: 'Link to a Base recipe' })).toBeInTheDocument()
  })
})

describe('the Note of a line', () => {
  it('is in the row either way; data-has-note says whether the line has one', () => {
    const { row } = view()
    expect(screen.getByRole('textbox', { name: 'Note' })).toBeInTheDocument()
    expect(row).toHaveAttribute('data-has-note', 'false')
  })

  it('a line with a Note says so', () => {
    const { row } = view(props({ line: line({ note: 'finely sliced' }) }))
    expect(row).toHaveAttribute('data-has-note', 'true')
  })

  it('"Add note" reveals it and puts the cursor in it', async () => {
    const { row } = view()
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Add note' }))
    expect(row).toHaveAttribute('data-has-note', 'true')
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveFocus()
  })
})

describe('the row keeps its parts in reading order', () => {
  it('handle, Ingredient, Quantity, Unit, Note, Optional, actions: the order of the captions above the list', () => {
    const { row } = view(props({ handle: <button type="button" aria-label="Reorder garlic">h</button> }))
    const order = [
      screen.getByRole('button', { name: 'Reorder garlic' }),
      screen.getByRole('combobox', { name: /^Ingredient( of line \d+)?$/ }),
      screen.getByRole('textbox', { name: 'Quantity' }),
      screen.getByRole('combobox', { name: /^Unit( for .+)?$/ }),
      screen.getByRole('textbox', { name: 'Note' }),
      screen.getByRole('checkbox', { name: 'Optional: garlic' }),
      screen.getByRole('button', { name: 'Actions for garlic' }),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy()
    }
    expect(row.classList.contains('line-row')).toBe(true)
  })
})
