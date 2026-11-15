// The Planning overrides (B9-37, RX-02, RX-10; was RecipeDetailsFields.frozenUseBy/.reheat/.sizes): Cool-down, Leftover Use-by,
// Reheat time and Frozen Use-by are xs number fields with their unit inside (no stepper: blank means the Household's setting), with no
// helper of their own: one footnote under them names the Household's values. B5-LOW (Frozen Use-by 1 to 365) and R12 (Reheat time) keep
// their behaviour: blank by default, a typed value committed as text, an emptied field blank, the error on the field.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseChoices } from '../fixtures.test-helper'
import { emptyDraft, type DraftErrors, type RecipeDraft } from '../lib/draft'
import { RecipePlanningFields } from './RecipePlanningFields'

const defaults = { cooldownDays: 7, leftoverUseByDays: 2, frozenUseByDays: 60 }
const view = (over: Partial<RecipeDraft> = {}, errors: DraftErrors = {}) => {
  const onChange = vi.fn()
  const { container } = render(<RecipePlanningFields draft={{ ...emptyDraft(), name: 'Curry', courseIds: [1], ...over }} errors={errors} courses={courseChoices} onChange={onChange} defaults={defaults} />)
  return { onChange, container }
}
const NAMES = ['Cool-down', 'Leftover Use-by', 'Reheat time', 'Frozen Use-by']

describe('RecipePlanningFields: the overrides', () => {
  it('are four xs fields in one grid, in this order, blank by default, with their unit as a suffix and no stepper', () => {
    const { container } = view()
    const grid = container.querySelector('.recipe-planning__grid')!
    const fields = NAMES.map((name) => screen.getByRole('spinbutton', { name }))
    for (const f of fields) {
      expect(grid).toContainElement(f)
      expect(f.closest('.ui-field')).toHaveAttribute('data-size', 'xs')
      expect(f).toHaveDisplayValue('')
    }
    for (let i = 1; i < fields.length; i++) expect(fields[i - 1]!.compareDocumentPosition(fields[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect([...grid.querySelectorAll('.ui-field__suffix')].map((s) => s.textContent)).toEqual(['days', 'days', 'min', 'days'])
    for (const name of NAMES) expect(screen.queryByRole('button', { name: `Increase ${name}` }), name).toBeNull()
  })
  it('share one footnote with the Household\'s own values, and have no helper of their own', () => {
    view()
    expect(screen.getByText("Leave a field blank to use the Household's setting: Cool-down 7 days, Leftover Use-by 2 days, Frozen Use-by 60 days. Reheat time without a value is worked out from the portions.")).toBeInTheDocument()
    for (const old of ['Blank uses the household default', 'Blank: Reheat works it out from the portions', "Blank uses the Household's 60 days."]) expect(screen.queryByText(old)).toBeNull()
  })
  it("show the Recipe's own values", () => {
    view({ frozenUseByDays: '30', reheatMinutes: '6', cooldownDays: '3' })
    expect(screen.getByRole('spinbutton', { name: 'Frozen Use-by' })).toHaveDisplayValue('30')
    expect(screen.getByRole('spinbutton', { name: 'Reheat time' })).toHaveDisplayValue('6')
    expect(screen.getByRole('spinbutton', { name: 'Cool-down' })).toHaveDisplayValue('3')
  })
  it('commit a typed value as text, and an emptied field as blank (the Household default)', async () => {
    const { onChange } = view({ frozenUseByDays: '30', cooldownDays: '3' })
    const frozen = screen.getByRole('spinbutton', { name: 'Frozen Use-by' })
    await userEvent.clear(frozen)
    await userEvent.type(frozen, '120')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ frozenUseByDays: '120' })
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Reheat time' }), '5')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ reheatMinutes: '5' })
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'Cool-down' }))
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ cooldownDays: '' })
  })
  it('put the error on the field', () => {
    view({ frozenUseByDays: '400', reheatMinutes: '45' }, { frozenUseByDays: 'frozen_use_by_invalid', reheatMinutes: 'reheat_invalid' })
    expect(screen.getByText('Frozen Use-by must be 1 to 365 days.')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Frozen Use-by' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Reheat time must be 1 to 30 minutes.')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Reheat time' })).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('RecipePlanningFields: a Base recipe (BR-D)', () => {
  it('is never planned: no Courses, Whole meal or overrides, only its Tags', () => {
    view({ baseRecipe: true, yieldUnit: 'l', courseIds: [] })
    expect(screen.queryByRole('group', { name: 'Courses' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Whole meal' })).toBeNull()
    for (const name of NAMES) expect(screen.queryByRole('spinbutton', { name })).toBeNull()
    expect(screen.getByRole('group', { name: 'Tags' })).toBeInTheDocument()
  })
  it('keeps them for a plannable Recipe', () => {
    view()
    expect(screen.getByRole('group', { name: 'Courses' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Cool-down' })).toBeInTheDocument()
  })
})
