import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyDraft } from '../lib/draft'
import { RecipeDetailsFields } from './RecipeDetailsFields'

const view = (over = {}, errors = {}) => {
  const onChange = vi.fn()
  render(<RecipeDetailsFields draft={{ ...emptyDraft(), name: 'Aioli', ...over }} errors={errors} onChange={onChange} />)
  return onChange
}

describe('RecipeDetailsFields', () => {
  it('uses field primitives: Ready Meal is a Checkbox with its hint, Yield a number field', () => {
    view()
    const box = screen.getByRole('checkbox', { name: /Ready Meal/ })
    expect(box).not.toBeChecked()
    expect(screen.getByText('Made from one bought pack')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Yield' })).toHaveDisplayValue('4')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Aioli')
  })
  it('toggles Ready Meal', async () => {
    const onChange = view()
    await userEvent.click(screen.getByRole('checkbox', { name: /Ready Meal/ }))
    expect(onChange).toHaveBeenCalledWith({ readyMeal: true })
  })
  it('commits a typed Yield as text', async () => {
    const onChange = view()
    const field = screen.getByRole('spinbutton', { name: 'Yield' })
    await userEvent.clear(field)
    await userEvent.type(field, '6')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ yield: '6' })
  })
  it('an emptied Cool-down means "household default" (blank text)', async () => {
    const onChange = view({ cooldownDays: '3' })
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'Cool-down (days)' }))
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ cooldownDays: '' })
  })
  it('puts the error on the field', () => {
    view({ name: '' }, { name: 'name_required' })
    expect(screen.getByText('Give the Recipe a name.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true')
  })
})
