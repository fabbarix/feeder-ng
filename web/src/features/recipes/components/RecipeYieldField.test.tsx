// RX-02 (B9-37; was RecipeDetailsFields.sizes.test.tsx and the Yield cases of RecipeDetailsFields.test/.baseRecipe): the Yield sits in
// the Ingredients head and says what it means: "For one Batch of [– 4 +] portions", "One pack is [– 2 +] portions" for a Ready Meal, and
// "One Batch makes [800] [g]" for a Base recipe (an amount and a unit select). The Yield is a compact stepper; no native control.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyDraft, type DraftErrors, type RecipeDraft } from '../lib/draft'
import { RecipeYieldField } from './RecipeYieldField'

const view = (over: Partial<RecipeDraft> = {}, errors: DraftErrors = {}) => {
  const onChange = vi.fn()
  const { container } = render(<RecipeYieldField draft={{ ...emptyDraft(), name: 'Aioli', ...over }} errors={errors} onChange={onChange} />)
  return { onChange, container }
}
const base = { baseRecipe: true, yieldUnit: 'l', yield: '1', courseIds: [] as number[] }

describe('RecipeYieldField', () => {
  it('a Recipe: "For one Batch of [– 4 +] portions", a compact stepper named Yield', () => {
    const { container } = view()
    expect(screen.getByText('For one Batch of')).toBeInTheDocument()
    expect(screen.getByText('portions')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Yield' })).toHaveAttribute('aria-valuenow', '4')
    expect(container.querySelector('.stepper')).toHaveAttribute('data-size', 'sm')
    expect(container.querySelector('select, input[type=number]')).toBeNull()
  })
  it('steps the Yield and commits it as text', async () => {
    const { onChange } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Yield' }))
    expect(onChange).toHaveBeenCalledWith({ yield: '5' })
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Yield' }))
    expect(onChange).toHaveBeenCalledWith({ yield: '3' })
  })
  it('a Ready Meal: "One pack is … portions"', () => {
    view({ readyMeal: true, yield: '2' })
    expect(screen.getByText('One pack is')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Yield' })).toHaveAttribute('aria-valuenow', '2')
  })
  it('a Base recipe: "One Batch makes" an amount plus a unit select with g, kg, ml, l, piece and portion', async () => {
    const { onChange } = view(base)
    expect(screen.getByText('One Batch makes')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Yield' })).toHaveDisplayValue('1')
    const unit = screen.getByRole('combobox', { name: 'Yield unit' })
    expect(unit).toHaveTextContent('l')
    await userEvent.click(unit)
    for (const u of ['g', 'kg', 'ml', 'piece', 'portion']) expect(screen.getByRole('option', { name: new RegExp(`^${u}`) })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /^kg/ }))
    expect(onChange).toHaveBeenCalledWith({ yieldUnit: 'kg' })
  })
  it('commits a typed Base recipe amount as text', async () => {
    const { onChange } = view(base)
    const field = screen.getByRole('spinbutton', { name: 'Yield' })
    await userEvent.clear(field)
    await userEvent.type(field, '6')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ yield: '6' })
  })
  it('has no Yield unit select for a plannable Recipe', () => {
    view()
    expect(screen.queryByRole('combobox', { name: 'Yield unit' })).toBeNull()
  })
  it('shows a missing Yield unit as an error on the select', () => {
    view({ ...base, yieldUnit: '' }, { yieldUnit: 'yield_unit_invalid' })
    expect(screen.getByRole('combobox', { name: 'Yield unit' })).toBeInvalid()
  })
})
