// R2-1 (E-01, F-01 adoption): the ingredient line is Ingredient · Quantity xs · Unit sm · Note · remove (Optional is a menu item and a chip in the Ingredient cell).
import { render, screen } from '@testing-library/react'
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
    expect(sizeOf(screen.getByRole('combobox', { name: /^Ingredient( of line \d+)?$/ }))).toBe('full')
    expect(sizeOf(screen.getByRole('textbox', { name: 'Quantity' }))).toBe('xs')
    expect(sizeOf(screen.getByRole('combobox', { name: /^Unit( for .+)?$/ }))).toBe('sm')
    expect(sizeOf(screen.getByRole('textbox', { name: 'Note' }))).toBe('full')
  })
  it('Note has the placeholder "note" (the label is hidden from 720 px by CSS)', () => {
    view()
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveAttribute('placeholder', 'note')
  })
})

describe('IngredientLineRow: "Optional" is a checkbox on the line (B9-37, RX-10; was a menu item plus a chip)', () => {
  it('the line has an unchecked "Optional: garlic" checkbox for an ordinary line, which toggles it on', async () => {
    const { onChange } = view()
    const box = screen.getByRole('checkbox', { name: 'Optional: garlic' })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(onChange).toHaveBeenCalledWith({ optional: true })
  })
  it('the checkbox is checked when the line is optional and toggles it off', async () => {
    const { onChange } = view({ optional: true })
    const box = screen.getByRole('checkbox', { name: 'Optional: garlic' })
    expect(box).toBeChecked()
    await userEvent.click(box)
    expect(onChange).toHaveBeenCalledWith({ optional: false })
  })
  it('works without a drag handle or onMove: the menu has no Move items and no Optional item', async () => {
    view({ optional: false })
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    expect(screen.queryByRole('menuitem', { name: 'Move ingredient up' })).toBeNull()
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Optional' })).toBeNull()
  })
  it('an ordinary line shows no Optional chip, and an optional line shows none either: the checkbox says it', () => {
    const { container } = view()
    expect(container.querySelector('.line-row .chip')).toBeNull()
    const { container: optional } = view({ optional: true })
    expect([...optional.querySelectorAll('.line-row .chip')].filter((c) => c.textContent === 'Optional')).toHaveLength(0)
  })
  it('no [title] attribute anywhere in the line, except on chips (their full text, DS-A system.md §6)', () => {
    const { container } = view({ optional: true })
    expect(container.querySelector('[title]:not(.chip)')).toBeNull()
    for (const chip of container.querySelectorAll('.chip[title]')) expect(chip.getAttribute('title')).toBe(chip.textContent)
  })
})
