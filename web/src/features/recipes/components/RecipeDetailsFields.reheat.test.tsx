import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyDraft } from '../lib/draft'
import { RecipeDetailsFields } from './RecipeDetailsFields'

// R12: a compact "Reheat time (minutes)" field in the Recipe editor, after the Use-by override.
const view = (over = {}, errors = {}) => {
  const onChange = vi.fn()
  render(<RecipeDetailsFields draft={{ ...emptyDraft(), name: 'Curry', ...over }} errors={errors} onChange={onChange} />)
  return onChange
}

describe('RecipeDetailsFields: reheat time (R12)', () => {
  it('renders a number field with its hint, blank by default', () => {
    view()
    const field = screen.getByRole('spinbutton', { name: 'Reheat time (minutes)' })
    expect(field).toHaveDisplayValue('')
    expect(screen.getByText('Blank: Reheat works it out from the portions')).toBeInTheDocument()
  })

  it('shows the Recipe\'s stored reheat time', () => {
    view({ reheatMinutes: '6' })
    expect(screen.getByRole('spinbutton', { name: 'Reheat time (minutes)' })).toHaveDisplayValue('6')
  })

  it('commits a typed time as text', async () => {
    const onChange = view()
    const field = screen.getByRole('spinbutton', { name: 'Reheat time (minutes)' })
    await userEvent.type(field, '5')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ reheatMinutes: '5' })
  })

  it('an emptied field means "not set" (blank text)', async () => {
    const onChange = view({ reheatMinutes: '5' })
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'Reheat time (minutes)' }))
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ reheatMinutes: '' })
  })

  it('puts the error on the field', () => {
    view({ reheatMinutes: '45' }, { reheatMinutes: 'reheat_invalid' })
    expect(screen.getByText('Reheat time must be 1 to 30 minutes.')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Reheat time (minutes)' })).toHaveAttribute('aria-invalid', 'true')
  })
})
