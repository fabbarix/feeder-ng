// R2-1 (E-01, F-01 adoption): the ingredient line is Ingredient · Quantity xs · Unit sm · Note · remove (Optional is a menu item and a chip in the Ingredient cell).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import type { LineDraft } from '../lib/draft'
import { IngredientLineRow } from './IngredientLineRow'

const line = (over: Partial<LineDraft> = {}): LineDraft => ({ key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '', ...over })
const view = (over: Partial<LineDraft> = {}) => {
  const onChange = vi.fn()
  const { container } = render(
    <ul>
      <IngredientLineRow line={line(over)} index={0} errors={{}} ingredient={garlic} ingredients={[garlic, flour]} onPick={vi.fn()} onChange={onChange} onRemove={vi.fn()} />
    </ul>,
  )
  return { onChange, container }
}
const sizeOf = (el: HTMLElement) => el.closest('.ui-field')!.getAttribute('data-size')

describe('IngredientLineRow: sizes', () => {
  it('Ingredient and Note take the free space (full); Quantity is xs and Unit is sm', () => {
    view()
    expect(sizeOf(screen.getByRole('combobox', { name: 'Ingredient' }))).toBe('full')
    expect(sizeOf(screen.getByRole('textbox', { name: 'Quantity' }))).toBe('xs')
    expect(sizeOf(screen.getByRole('combobox', { name: 'Unit' }))).toBe('sm')
    expect(sizeOf(screen.getByRole('textbox', { name: 'Note' }))).toBe('full')
  })
  it('Note has the placeholder "note" (the label is hidden from 720 px by CSS)', () => {
    view()
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveAttribute('placeholder', 'note')
  })
})

describe('IngredientLineRow: "Optional" is a menu item plus a status chip (never a tooltip-only icon)', () => {
  const open = async () => userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
  it('the actions menu has a checkable "Optional" item, unchecked for an ordinary line, that toggles it on', async () => {
    const { onChange } = view()
    await open()
    const item = screen.getByRole('menuitemcheckbox', { name: 'Optional' })
    expect(item).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(item)
    expect(onChange).toHaveBeenCalledWith({ optional: true })
  })
  it('the item is checked when the line is optional and toggles it off', async () => {
    const { onChange } = view({ optional: true })
    await open()
    const item = screen.getByRole('menuitemcheckbox', { name: 'Optional' })
    expect(item).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(item)
    expect(onChange).toHaveBeenCalledWith({ optional: false })
  })
  it('works without a drag handle or onMove: the menu still has the Optional item and no Move items', async () => {
    view({ optional: false })
    await open()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Optional' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Move ingredient up' })).toBeNull()
  })
  it('an ordinary line shows no Optional chip', () => {
    const { container } = view()
    expect(container.querySelector('.line-row .chip')).toBeNull()
    expect(screen.queryByText('Optional')).toBeNull()
  })
  it('an optional line shows a compact non-interactive "Optional" chip inside the Ingredient cell, after the picker, announced with the line', () => {
    const { container } = view({ optional: true })
    const cell = container.querySelector('.line-row__ingredient')!
    const chip = cell.querySelector('.chip') as HTMLElement
    expect(chip).not.toBeNull()
    expect(chip.tagName).toBe('SPAN')
    expect(chip).toHaveTextContent('Optional')
    expect(chip).toHaveAttribute('data-kind', 'tag')
    expect(chip.closest('button')).toBeNull()
    expect(chip).not.toHaveAttribute('aria-hidden')
    const combo = within(cell as HTMLElement).getByRole('combobox', { name: 'Ingredient' })
    expect(combo.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('li.line-row')!.textContent).toContain('Optional')
  })
  it('no [title] attribute anywhere in the line', () => {
    const { container } = view({ optional: true })
    expect(container.querySelector('[title]')).toBeNull()
  })
})
