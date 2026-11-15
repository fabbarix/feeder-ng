// B9-48 (SET-05, SAFE-04): the New Ingredient / New Supply sheet uses the same Stepper field as Keeping for Shelf Life (optional: the
// value can be "not set", drawn empty), and its form-level failure is the shared FormError.
// API: Shelf Life is a labelled Stepper group "Shelf Life" (unit "days", min 1, max 3650) with the helper "Leave blank if it keeps.";
//   not set at first: an empty value, Decrease disabled; Increase gives 1; Decrease from 1 is "not set" again, so the body has no
//   shelfLifeDays. (If the shared StepperField cannot draw "not set" yet, an additive `format` prop on ui/fields/StepperField is the
//   one edit outside this package: say so in the hand-back.)
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { NewIngredientSheet, type NewIngredientSheetProps } from './NewIngredientSheet'

const none = { exact: null, suggestions: [] }
function setup(over: Partial<NewIngredientSheetProps> = {}) {
  const props: NewIngredientSheetProps = { open: true, onClose: vi.fn(), onCreate: vi.fn().mockResolvedValue({}), findSimilar: vi.fn().mockResolvedValue(none), ...over }
  render(<NewIngredientSheet {...props} />)
  return props
}
const group = () => screen.getByRole('group', { name: 'Shelf Life' })
const value = () => within(group()).getByRole('spinbutton', { name: 'Shelf Life' })
const up = () => within(group()).getByRole('button', { name: 'Increase Shelf Life' })
const down = () => within(group()).getByRole('button', { name: 'Decrease Shelf Life' })
const create = () => screen.getByRole('button', { name: 'Create Ingredient' })

describe('New Ingredient: Shelf Life as a Stepper field', () => {
  it('is a Stepper group in days with its helper, not a text field', () => {
    setup()
    expect(within(group()).getByText('days')).toBeInTheDocument()
    expect(group()).toHaveAccessibleDescription('Leave blank if it keeps.')
    expect(screen.queryByRole('textbox', { name: /Shelf Life/ })).toBeNull()
    expect(document.querySelector('input[type=number]')).toBeNull()
  })
  it('starts not set: empty value, Decrease disabled', () => {
    setup()
    expect(value()).toHaveTextContent('')
    expect(down()).toBeDisabled()
  })
  it('Increase gives 1 day, then 2; the body carries it', async () => {
    const p = setup({ initialName: 'Milk' })
    await userEvent.click(up())
    expect(value()).toHaveTextContent('1')
    await userEvent.click(up())
    await userEvent.click(create())
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'Milk', baseUnit: 'g', shelfLifeDays: 2, kind: 'food' })
  })
  it('going back down from 1 is "not set" again: no shelfLifeDays in the body', async () => {
    const p = setup({ initialName: 'Salt' })
    await userEvent.click(up())
    await userEvent.click(down())
    expect(value()).toHaveTextContent('')
    await userEvent.click(create())
    expect((p.onCreate as ReturnType<typeof vi.fn>).mock.calls[0]![0]).not.toHaveProperty('shelfLifeDays')
  })
  it('the arrow keys step it too', async () => {
    setup()
    value().focus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(value()).toHaveTextContent('2')
  })
  it('a Supply has no Shelf Life Stepper', () => {
    setup({ kind: 'supply' })
    expect(screen.queryByRole('group', { name: 'Shelf Life' })).toBeNull()
  })
})

describe('New Ingredient: errors (SAFE-04)', () => {
  it('a server failure with no field is the one FormError and the only alert', async () => {
    setup({ initialName: 'Milk', onCreate: vi.fn().mockRejectedValue(new ApiError(500, 'server_error', 'boom')) })
    await userEvent.click(create())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('form-error')
    expect(alert).toHaveTextContent('That did not work. Try again.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
  it('a Supply with a bad Restock level: the message under the field, aria-invalid, focus there, no alert', async () => {
    const p = setup({ kind: 'supply', initialName: 'bin bags' })
    const field = screen.getByRole('textbox', { name: /Restock level/ })
    await userEvent.type(field, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Create Supply' }))
    expect(p.onCreate).not.toHaveBeenCalled()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(/Enter an amount greater than 0/)
    expect(field).toHaveFocus()
    expect(screen.queryAllByRole('alert')).toEqual([])
  })
  it('an empty name is still the Name field\'s error with focus on it', async () => {
    setup()
    await userEvent.click(create())
    const name = screen.getByLabelText('Name')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveFocus()
  })
})
