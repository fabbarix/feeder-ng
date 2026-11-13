// B5-LOW: "Frozen Use-by" after the Use-by field of the Recipe editor (optional, whole days 1 to 365).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyDraft } from '../lib/draft'
import { RecipeDetailsFields } from './RecipeDetailsFields'

const view = (over = {}, errors = {}, household?: number) => {
  const onChange = vi.fn()
  render(<RecipeDetailsFields draft={{ ...emptyDraft(), name: 'Curry', ...over }} errors={errors} onChange={onChange} householdFrozenUseBy={household} />)
  return onChange
}

describe('RecipeDetailsFields: Frozen Use-by', () => {
  it('is a number field in days after Use-by, blank by default, with the Household helper', () => {
    view({}, {}, 60)
    const field = screen.getByRole('spinbutton', { name: 'Frozen Use-by' })
    expect(field).toHaveDisplayValue('')
    expect(screen.getByText("Blank uses the Household's 60 days.")).toBeInTheDocument()
    // Its own field after the Yield, Cool-down, Use-by and Reheat time row.
    const reheat = screen.getByRole('spinbutton', { name: 'Reheat time' })
    expect(reheat.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const use = screen.getByRole('spinbutton', { name: 'Use-by' })
    expect(use.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('helper says 90 days when the Household default is not known yet', () => {
    view()
    expect(screen.getByText("Blank uses the Household's 90 days.")).toBeInTheDocument()
  })
  it("shows the Recipe's own value", () => {
    view({ frozenUseByDays: '30' })
    expect(screen.getByRole('spinbutton', { name: 'Frozen Use-by' })).toHaveDisplayValue('30')
  })
  it('commits a typed value as text and an emptied field as blank', async () => {
    const onChange = view({ frozenUseByDays: '30' })
    const field = screen.getByRole('spinbutton', { name: 'Frozen Use-by' })
    await userEvent.clear(field)
    await userEvent.type(field, '120')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ frozenUseByDays: '120' })
  })
  it('puts the error on the field', () => {
    view({ frozenUseByDays: '400' }, { frozenUseByDays: 'frozen_use_by_invalid' })
    expect(screen.getByText('Frozen Use-by must be 1 to 365 days.')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Frozen Use-by' })).toHaveAttribute('aria-invalid', 'true')
  })
})
