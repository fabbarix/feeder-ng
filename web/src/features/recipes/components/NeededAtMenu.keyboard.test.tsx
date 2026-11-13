import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IngredientLineRow } from './IngredientLineRow'
import { NeededAtMenu } from './NeededAtMenu'
import { garlic, milk } from '../fixtures.test-helper'
import type { LineDraft } from '../lib/draft'
import type { IngredientRef } from '../types'

// BR-D round 3: the Needed at chip-menu on the shared Menu: keyboard, focus return, and "(default)" sending null.
const steps = [
  { text: 'Marinate', kind: 'advance' as const },
  { text: 'Boil the pasta', kind: 'active' as const },
  { text: 'Layer the lasagne', kind: 'passive' as const },
  { text: 'Serve', kind: 'active' as const },
]
const show = (over: Partial<React.ComponentProps<typeof NeededAtMenu>> = {}) => {
  const onChange = vi.fn()
  render(<NeededAtMenu steps={steps} value={2} defaultStep={2} lineName="Béchamel" onChange={onChange} {...over} />)
  return onChange
}
const trigger = () => screen.getByRole('button', { name: /Needed at Step 3|Before you start|Needed at Step/ })

describe('NeededAtMenu keyboard', () => {
  it('Enter on the chip opens the menu and focuses the Step that applies', async () => {
    show()
    trigger().focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(document.activeElement).toHaveTextContent(/Step 3/)
  })
  it('ArrowDown opens it too, and the arrows move between the Steps (Advance Steps are not listed)', async () => {
    show()
    trigger().focus()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toHaveTextContent(/Step 4/)
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(document.activeElement).toHaveTextContent(/Before you start/)
    expect(screen.queryByText(/Marinate/)).toBeNull()
  })
  it('Enter chooses the focused Step and the focus goes back to the chip', async () => {
    const onChange = show()
    trigger().focus()
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(3)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: /Needed at|Before you start/ })).toHaveFocus()
  })
  it('Escape closes it without choosing and returns the focus to the chip', async () => {
    const onChange = show()
    trigger().focus()
    await userEvent.keyboard('{Enter}{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger()).toHaveFocus()
  })
  it('Tab and a click outside close it', async () => {
    show()
    await userEvent.click(trigger())
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('NeededAtMenu: "(default)"', () => {
  it('choosing the default Step sends null, not its index (the default follows later Step edits)', async () => {
    const onChange = show({ value: 3, defaultStep: 2 })
    await userEvent.click(screen.getByRole('button', { name: /Needed at Step 4/ }))
    await userEvent.click(screen.getByText('Step 3: Layer the lasagne (default)'))
    expect(onChange).toHaveBeenCalledWith(null)
  })
  it('choosing any other Step sends its index', async () => {
    const onChange = show({ value: 2, defaultStep: 2 })
    await userEvent.click(trigger())
    await userEvent.click(screen.getByText('Step 4: Serve'))
    expect(onChange).toHaveBeenCalledWith(3)
  })
})

describe('Needed at on the line row follows Step edits', () => {
  const bech: IngredientRef = { id: 30, name: 'Béchamel', baseUnit: 'ml', conversions: [], baseRecipe: { id: 3, name: 'Béchamel', archived: false } }
  const line: LineDraft = { key: 'l', ingredientId: 30, ingredientName: 'Béchamel', quantity: '500', unit: 'ml', optional: false, note: '', baseRecipeId: 3, baseRecipeName: 'Béchamel', neededAtStep: null }
  const row = (neededAtDefault: number | null, s = steps) => (
    <ul><IngredientLineRow line={line} index={0} errors={{}} ingredient={bech} ingredients={[garlic, milk, bech]} onPick={() => {}} onChange={() => {}} onRemove={() => {}} steps={s} neededAtDefault={neededAtDefault} onNeededAt={() => {}} /></ul>
  )
  it('with no override the chip shows the default and moves when the default moves', () => {
    const { rerender } = render(row(2))
    expect(screen.getByRole('button', { name: /Needed at Step 3/ })).toBeInTheDocument()
    rerender(row(3))
    expect(screen.getByRole('button', { name: /Needed at Step 4/ })).toBeInTheDocument()
  })
  it('with no Step at all it reads "Before you start"', () => {
    render(row(null, []))
    expect(screen.getByRole('button', { name: /Before you start/ })).toBeInTheDocument()
  })
})
