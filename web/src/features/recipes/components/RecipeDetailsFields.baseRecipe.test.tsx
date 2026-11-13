import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseChoices } from '../fixtures.test-helper'
import { emptyDraft, type RecipeDraft } from '../lib/draft'
import { RecipeDetailsFields } from './RecipeDetailsFields'

// BR-D (design §13): the Base recipe switch, the Yield unit, and the fields that go away.
const view = (over: Partial<RecipeDraft> = {}, extra: Partial<React.ComponentProps<typeof RecipeDetailsFields>> = {}) => {
  const onChange = vi.fn()
  const onBaseRecipeChange = vi.fn()
  render(<RecipeDetailsFields draft={{ ...emptyDraft(), name: 'Béchamel', courseIds: [1, 2], ...over }} errors={{}} onChange={onChange} courses={courseChoices} onBaseRecipeChange={onBaseRecipeChange} {...extra} />)
  return { onChange, onBaseRecipeChange }
}
const base = { baseRecipe: true, yieldUnit: 'l', yield: '1', courseIds: [] as number[] }

describe('RecipeDetailsFields: the Base recipe switch', () => {
  it('is a crafted switch with the helper "Used inside other Recipes and never planned"', () => {
    view()
    const sw = screen.getByRole('switch', { name: 'Base recipe' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Used inside other Recipes and never planned')).toBeInTheDocument()
  })
  it('is not drawn when the screen gives no handler', () => {
    render(<RecipeDetailsFields draft={emptyDraft()} errors={{}} onChange={() => {}} courses={courseChoices} />)
    expect(screen.queryByRole('switch', { name: 'Base recipe' })).toBeNull()
  })
  it('reports the switch to the screen (which decides: ask first, or patch the draft) and patches nothing itself', async () => {
    const { onChange, onBaseRecipeChange } = view()
    await userEvent.click(screen.getByRole('switch', { name: 'Base recipe' }))
    expect(onBaseRecipeChange).toHaveBeenCalledWith(true)
    expect(onChange).not.toHaveBeenCalled()
  })
  it('is on for a Base recipe and can be turned off', async () => {
    const { onBaseRecipeChange } = view(base)
    const sw = screen.getByRole('switch', { name: 'Base recipe' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(sw)
    expect(onBaseRecipeChange).toHaveBeenCalledWith(false)
  })
  it('is disabled while the kind change is in flight', () => {
    view({}, { baseRecipeBusy: true })
    expect(screen.getByRole('switch', { name: 'Base recipe' })).toBeDisabled()
  })
})

describe('RecipeDetailsFields: a Base recipe', () => {
  it('hides Courses, Whole meal, Ready Meal, Cool-down, Use-by, Reheat time and Frozen Use-by', () => {
    view(base)
    expect(screen.queryByText('Courses')).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Whole meal' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Ready Meal/ })).toBeNull()
    for (const name of ['Cool-down', 'Reheat time', 'Frozen Use-by', 'Leftover Use-by']) expect(screen.queryByRole('spinbutton', { name })).toBeNull()
  })
  it('keeps them for a plannable Recipe', () => {
    view()
    expect(screen.getByRole('checkbox', { name: /Ready Meal/ })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Cool-down' })).toBeInTheDocument()
  })
  it('makes Yield an amount plus a unit select with g, kg, ml, l, piece and portion', async () => {
    const { onChange } = view(base)
    expect(screen.getByRole('spinbutton', { name: 'Yield' })).toHaveDisplayValue('1')
    const unit = screen.getByRole('combobox', { name: 'Yield unit' })
    expect(unit).toHaveTextContent('l')
    await userEvent.click(unit)
    for (const u of ['g', 'kg', 'ml', 'piece', 'portion']) expect(screen.getByRole('option', { name: new RegExp(`^${u}`) })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /^kg/ }))
    expect(onChange).toHaveBeenCalledWith({ yieldUnit: 'kg' })
  })
  it('has no Yield unit select for a plannable Recipe', () => {
    view()
    expect(screen.queryByRole('combobox', { name: 'Yield unit' })).toBeNull()
  })
  it('shows a missing Yield unit as an error on the select', () => {
    render(<RecipeDetailsFields draft={{ ...emptyDraft(), name: 'B', baseRecipe: true, yieldUnit: '' }} errors={{ yieldUnit: 'yield_unit_invalid' }} onChange={() => {}} onBaseRecipeChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Yield unit' })).toBeInvalid()
  })
})
