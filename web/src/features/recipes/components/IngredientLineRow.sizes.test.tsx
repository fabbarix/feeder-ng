// R2-1 (E-01, F-01 adoption): the ingredient line is Ingredient · Quantity xs · Unit sm · Note · "Optional" chip · remove.
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

describe('IngredientLineRow: "Optional" is visible (never a tooltip-only icon)', () => {
  it('is a toggle chip with the visible text "Optional" and aria-pressed', async () => {
    const { onChange } = view()
    const chip = screen.getByRole('button', { name: 'Optional' })
    expect(chip).toHaveTextContent('Optional')
    expect(chip).toHaveClass('chip')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith({ optional: true })
  })
  it('shows the pressed state when the line is optional and toggles it off', async () => {
    const { onChange } = view({ optional: true })
    const chip = screen.getByRole('button', { name: 'Optional' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith({ optional: false })
  })
  it('relies on no title attribute or aria-label to name it (touch screens show neither)', () => {
    const { container } = view()
    expect(container.querySelector('[title]')).toBeNull()
    const chip = screen.getByRole('button', { name: 'Optional' })
    expect(chip).not.toHaveAttribute('aria-label')
    expect(chip.textContent?.trim()).toBe('Optional')
  })
})
