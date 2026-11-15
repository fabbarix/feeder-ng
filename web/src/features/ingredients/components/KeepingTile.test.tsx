// B9-48 (SET-05, SAFE-04): the "Keeping" tile: Base Unit, Shelf Life, Frozen Shelf Life (a Supply: Base Unit and Restock level) with
// ONE Save changes (the page's only accent), a Cancel while dirty, Steppers, hints at each row, errors at the field.
// Mock: docs/design/ui-review-3/mocks/set-05-ingredient.html (rows .kp-row: label + hint at the start, the control at the end).
//
// API pinned here (components/KeepingTile.tsx):
//   <KeepingTile kind={IngredientKind} name={string} form={UseKeepingForm} referenceCount={number} system={UnitSystem} />
//   `name` is the stored name; the tile shows displayName(name) in the toast it raises after a save: "Saved Keeping for Garlic" (a plain
//   toast, no Undo). The tile is a Tile section named "Keeping" (h2 "Keeping"), full width, holding one <form>; it calls
//   useFocusFirstInvalid itself (form.errors, form.submitCount). It never calls the API: form.submit() does.
// Rows (in order): Base Unit | Shelf Life | Frozen Shelf Life for food; Base Unit | Restock level for a Supply. Each row: a label
//   (body-strong), a hint line (meta, muted, from lib/keeping), the control at the end.
//   Base Unit: while referenceCount is 0 the BaseUnitPicker radiogroup "Base Unit" (choosing one edits the draft); referenced: the
//     value as text in [data-testid="base-unit-value"] (exactly "g") and the hint "Used in 4 places, so it can't change".
//   Shelf Life / Frozen Shelf Life: a Stepper (md, unit "days", min 1, max 3650) in a group of that name. NOT SET is a value with no number:
//     the spinbutton is empty, Decrease is disabled, Increase gives 1 (the Stepper's `format` can draw an empty value; if StepperField
//     needs the same for the New Ingredient sheet, that is an additive prop outside this package: say so in the hand-back).
//     "Clear" (outline, small, accessible name "Clear Shelf Life" / "Clear Frozen Shelf Life") shows only while the draft has a value.
//   Restock level (Supply): a text field "Restock level" (inputMode decimal, size sm) with the Base Unit label as its suffix, the
//     summary line (lib/kind restockSummary, in the Household display) as the row hint, "Clear" named "Clear Restock level" while it has text.
// Footer: "Save changes" (type submit, the only accent), disabled and described by "No changes to save" until dirty; "Cancel" (outline)
//   only while dirty. Save stays ENABLED when the draft is invalid (SAFE-04): the error appears at its field.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { alerts, findAlert } from '../ingredient.test-helper'
import { ApiError } from '../../../lib/http'
import { useKeepingForm } from '../hooks/useKeepingForm'
import { detail, dishSoapJSON, garlicJSON, toiletPaperJSON } from '../supply.test-helper'
import type { Ingredient, IngredientPatch } from '../types'
import { kindOf } from '../lib/kind'
import { KeepingTile } from './KeepingTile'
import type { UnitSystem } from '../../../lib/units'

const flour: Ingredient = { id: 3, name: 'flour', baseUnit: 'g', shelfLifeDays: 7, frozenShelfLifeDays: null, conversions: [], kind: 'food', restockLevel: null }

function Harness({ saved, save, referenceCount = 0, system = 'metric' }: { saved: Ingredient; save: (p: IngredientPatch) => Promise<unknown>; referenceCount?: number; system?: UnitSystem }) {
  const form = useKeepingForm(saved, save)
  return <KeepingTile kind={kindOf(saved)} name={saved.name} form={form} referenceCount={referenceCount} system={system} />
}
const setup = (saved: Ingredient = flour, referenceCount = 0, save = vi.fn().mockResolvedValue({}), system: UnitSystem = 'metric') => {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <Harness saved={saved} save={save} referenceCount={referenceCount} system={system} />
      </ConfirmProvider>
    </ToastProvider>,
  )
  return save
}
const tile = () => screen.getByRole('region', { name: 'Keeping' })
const stepper = (name: string) => within(tile()).getByRole('group', { name })
const value = (name: string) => within(stepper(name)).getByRole('spinbutton', { name }).textContent
const saveBtn = () => within(tile()).getByRole('button', { name: 'Save changes' })

describe('KeepingTile: anatomy', () => {
  it('is one Tile named Keeping with an h2, full width, one form', () => {
    setup()
    expect(tile()).toHaveClass('tile')
    expect(tile()).toHaveAttribute('data-span', 'full')
    expect(within(tile()).getByRole('heading', { level: 2, name: 'Keeping' })).toBeInTheDocument()
    expect(tile().querySelectorAll('form')).toHaveLength(1)
  })
  it('food: Base Unit, Shelf Life and Frozen Shelf Life rows, in that order, no Restock level', () => {
    setup()
    const labels = [...tile().querySelectorAll('.kp-row__label')].map((l) => l.textContent)
    expect(labels).toEqual(['Base Unit', 'Shelf Life', 'Frozen Shelf Life'])
    expect(within(tile()).queryByRole('textbox', { name: /Restock level/ })).toBeNull()
  })
  it('a Supply: Base Unit and Restock level rows, no Shelf Life at all', () => {
    setup(dishSoapJSON)
    const labels = [...tile().querySelectorAll('.kp-row__label')].map((l) => l.textContent)
    expect(labels).toEqual(['Base Unit', 'Restock level'])
    expect(within(tile()).queryByRole('group', { name: /Shelf Life/ })).toBeNull()
    expect(within(tile()).queryByText(/Freezer/)).toBeNull()
  })
  it('has no native form controls: no <select>, no number input', () => {
    setup()
    expect(tile().querySelector('select, input[type=number]')).toBeNull()
  })
})

describe('KeepingTile: Base Unit row', () => {
  it('unreferenced: the picker, and choosing a unit edits the draft (Save changes enables)', async () => {
    setup()
    const group = within(tile()).getByRole('radiogroup', { name: 'Base Unit' })
    expect(within(group).getByRole('radio', { name: 'g' })).toBeChecked()
    await userEvent.click(within(group).getByRole('radio', { name: 'ml' }))
    expect(saveBtn()).toBeEnabled()
  })
  it('referenced: the value as text with its reason, and no picker', () => {
    setup(flour, 4)
    expect(within(tile()).queryByRole('radiogroup')).toBeNull()
    expect(screen.getByTestId('base-unit-value').textContent).toBe('g')
    expect(within(tile()).getByText("Used in 4 places, so it can't change")).toBeInTheDocument()
  })
})

describe('KeepingTile: the two Steppers', () => {
  it('Shelf Life is a Stepper group of days with the saved value, and a hint only when something is to say', () => {
    setup()
    expect(value('Shelf Life')).toBe('7')
    expect(within(stepper('Shelf Life')).getByText('days')).toBeInTheDocument()
    expect(within(stepper('Shelf Life')).getByRole('button', { name: 'Decrease Shelf Life' })).toBeEnabled()
  })
  it('Increase and Decrease edit the draft and the row says what it was ("Changed from 7 days")', async () => {
    setup()
    await userEvent.click(within(stepper('Shelf Life')).getByRole('button', { name: 'Increase Shelf Life' }))
    await userEvent.click(within(stepper('Shelf Life')).getByRole('button', { name: 'Increase Shelf Life' }))
    expect(value('Shelf Life')).toBe('9')
    expect(within(tile()).getByText('Changed from 7 days')).toBeInTheDocument()
  })
  it('the arrow keys step the value too', async () => {
    setup()
    within(stepper('Shelf Life')).getByRole('spinbutton', { name: 'Shelf Life' }).focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(value('Shelf Life')).toBe('8')
  })
  it('Clear empties the draft (it saves with the rest), names its row, and goes away once nothing is set', async () => {
    setup()
    await userEvent.click(within(tile()).getByRole('button', { name: 'Clear Shelf Life' }))
    expect(value('Shelf Life')).toBe('')
    expect(within(tile()).queryByRole('button', { name: 'Clear Shelf Life' })).toBeNull()
    expect(within(stepper('Shelf Life')).getByRole('button', { name: 'Decrease Shelf Life' })).toBeDisabled()
    expect(within(tile()).getByText('Changed from 7 days')).toBeInTheDocument()
  })
  it('Clear reads "Clear" and is an outline small button', () => {
    setup()
    const clear = within(tile()).getByRole('button', { name: 'Clear Shelf Life' })
    expect(clear).toHaveTextContent(/^Clear$/)
    expect(clear).toHaveAttribute('data-variant', 'secondary')
    expect(clear).toHaveAttribute('data-size', 'sm')
  })
  it('not set: an empty value, Decrease disabled, no Clear, and the Freezer line for the frozen row', () => {
    setup()
    expect(value('Frozen Shelf Life')).toBe('')
    expect(within(stepper('Frozen Shelf Life')).getByRole('button', { name: 'Decrease Frozen Shelf Life' })).toBeDisabled()
    expect(within(tile()).queryByRole('button', { name: 'Clear Frozen Shelf Life' })).toBeNull()
    expect(within(tile()).getByText('Not set: moving a Stock Lot into a Freezer does not change when it goes off')).toBeInTheDocument()
  })
  it('Increase from not set gives 1 day', async () => {
    setup()
    await userEvent.click(within(stepper('Frozen Shelf Life')).getByRole('button', { name: 'Increase Frozen Shelf Life' }))
    expect(value('Frozen Shelf Life')).toBe('1')
    expect(within(tile()).getByRole('button', { name: 'Clear Frozen Shelf Life' })).toBeInTheDocument()
  })
  it('stops at 1 day going down with a value, and at 3650 going up', async () => {
    setup({ ...flour, shelfLifeDays: 3650 })
    expect(within(stepper('Shelf Life')).getByRole('button', { name: 'Increase Shelf Life' })).toBeDisabled()
    expect(within(stepper('Shelf Life')).getByRole('spinbutton', { name: 'Shelf Life' })).toHaveAttribute('aria-valuemax', '3650')
    expect(within(stepper('Shelf Life')).getByRole('spinbutton', { name: 'Shelf Life' })).toHaveAttribute('aria-valuemin', '1')
  })
})

describe('KeepingTile: one Save, one Cancel', () => {
  it('Save changes is the tile\'s only primary button; disabled and described "No changes to save" while clean; no Cancel', () => {
    setup()
    expect(tile().querySelectorAll('[data-variant="primary"]')).toHaveLength(1)
    expect(saveBtn()).toBeDisabled()
    expect(saveBtn()).toHaveAttribute('type', 'submit')
    expect(saveBtn()).toHaveAccessibleDescription('No changes to save')
    expect(within(tile()).queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
  it('one change enables Save changes (no description now) and shows an outline Cancel', async () => {
    setup()
    await userEvent.click(within(stepper('Shelf Life')).getByRole('button', { name: 'Increase Shelf Life' }))
    expect(saveBtn()).toBeEnabled()
    expect(saveBtn()).not.toHaveAccessibleDescription('No changes to save')
    expect(within(tile()).getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-variant', 'secondary')
  })
  it('Cancel puts the saved values back and hides itself', async () => {
    setup()
    await userEvent.click(within(stepper('Shelf Life')).getByRole('button', { name: 'Increase Shelf Life' }))
    await userEvent.click(within(tile()).getByRole('button', { name: 'Cancel' }))
    expect(value('Shelf Life')).toBe('7')
    expect(saveBtn()).toBeDisabled()
    expect(within(tile()).queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
  it('Change Shelf Life and Frozen Shelf Life and save both at once: ONE save, then "Saved Keeping for Flour"', async () => {
    const save = setup()
    await userEvent.click(within(stepper('Shelf Life')).getByRole('button', { name: 'Increase Shelf Life' }))
    await userEvent.click(within(stepper('Frozen Shelf Life')).getByRole('button', { name: 'Increase Frozen Shelf Life' }))
    await userEvent.click(saveBtn())
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ shelfLifeDays: 8, frozenShelfLifeDays: 1 })
    expect(await screen.findByText('Saved Keeping for Flour')).toBeInTheDocument()
    expect(saveBtn()).toBeDisabled()
  })
  it('Enter in the Restock field saves too (one form)', async () => {
    const save = setup(dishSoapJSON)
    const field = within(tile()).getByRole('textbox', { name: /Restock level/ })
    await userEvent.clear(field)
    await userEvent.type(field, '750{Enter}')
    expect(save).toHaveBeenCalledWith({ restockLevel: 750 })
  })
})

describe('KeepingTile: errors at the field, focus to the first invalid (SAFE-04)', () => {
  it('a bad Restock level: Save stays enabled; submit puts the message under the field, marks it invalid and focuses it', async () => {
    const save = setup(dishSoapJSON)
    const field = within(tile()).getByRole('textbox', { name: /Restock level/ })
    await userEvent.clear(field)
    await userEvent.type(field, 'abc')
    expect(saveBtn()).toBeEnabled()
    await userEvent.click(saveBtn())
    expect(save).not.toHaveBeenCalled()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(/Enter an amount greater than 0/)
    expect(field).toHaveFocus()
    expect(alerts()).toEqual([]) // a field's error is not an alert: focus announces it
  })
  it('a server refusal is the form-level alert (the one FormError), and nothing is lost', async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(500, 'server_error', 'boom'))
    setup(flour, 0, save)
    await userEvent.click(within(stepper('Shelf Life')).getByRole('button', { name: 'Increase Shelf Life' }))
    await userEvent.click(saveBtn())
    const alert = await findAlert()
    expect(alert).toHaveClass('form-error')
    expect(alert).toHaveTextContent('That did not work. Try again.')
    expect(alerts()).toHaveLength(1)
    expect(value('Shelf Life')).toBe('8')
  })
})

describe('KeepingTile: a Supply\'s Restock level', () => {
  it('a field in Base Units with the unit counted by the level, and the summary in the Household display as the row hint', () => {
    setup(toiletPaperJSON)
    expect(within(tile()).getByRole('textbox', { name: /Restock level/ })).toHaveValue('6')
    expect(within(tile()).getByText('pieces')).toBeInTheDocument()
    expect(within(tile()).getByText('Below 6 pieces')).toBeInTheDocument()
  })
  it('imperial: the field stays metric, the summary follows the Household', () => {
    setup(dishSoapJSON, 0, vi.fn(), 'imperial')
    expect(within(tile()).getByRole('textbox', { name: /Restock level/ })).toHaveValue('500')
    const field = within(tile()).getByRole('textbox', { name: /Restock level/ })
    expect(within(field.closest('.ui-field') as HTMLElement).getByText('ml')).toBeInTheDocument() // the suffix, not the Base Unit option
    expect(within(tile()).getByText('Below 2 cups')).toBeInTheDocument()
  })
  it('no level: an empty field and "No Restock level"; no Clear', () => {
    setup({ ...dishSoapJSON, restockLevel: null })
    expect(within(tile()).getByRole('textbox', { name: /Restock level/ })).toHaveValue('')
    expect(within(tile()).getByText('No Restock level')).toBeInTheDocument()
    expect(within(tile()).queryByRole('button', { name: 'Clear Restock level' })).toBeNull()
  })
  it('Clear empties the field (saved with the rest as null)', async () => {
    const save = setup(dishSoapJSON)
    await userEvent.click(within(tile()).getByRole('button', { name: 'Clear Restock level' }))
    expect(within(tile()).getByRole('textbox', { name: /Restock level/ })).toHaveValue('')
    await userEvent.click(saveBtn())
    expect(save).toHaveBeenCalledWith({ restockLevel: null })
  })
})

describe('KeepingTile: the detail fixture is a plain Ingredient too', () => {
  it('works from a detail with references (Base Unit locked by the screen, not by the tile)', () => {
    setup(detail(garlicJSON, { products: 1 }))
    expect(value('Shelf Life')).toBe('30')
  })
})
