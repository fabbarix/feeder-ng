// SET-09, SET-10, SHORT-02, SAFE-04, SET-14h: the Meal Slot sheet's footer and form behaviour.
//   Footer, add:  [Cancel (outlined)] [Save Meal Slot (primary, submits the sheet's form)]; no circular Close (R-B).
//   Footer, edit: [⋮ "More for Dinner": Change a date, Remove Meal Slot (danger)] [Cancel] [Save Meal Slot]; no Close, no Remove button of its own.
// Built on B9-14's BottomSheet (`onCancel`, `submit={{ label, form }}`, `confirmDismiss`) and FormActions `more`; on this branch those are
// type-only stubs, so the footer tests below are red until B9-14's developer lands (see the hand-back).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { members, tuesdayDinner } from './fixtures'
import { MealSlotEditor, type MealSlotEditorProps } from './MealSlotEditor'

const dinner = (weekday: number) => ({ ...tuesdayDinner, id: 40 + weekday, weekday })
const allDays = [1, 2, 3, 4, 5, 6, 7].map(dinner)

function edit(over: Partial<MealSlotEditorProps> = {}) {
  const props = { open: true, members, slot: dinner(2), slots: allDays, onSave: vi.fn(), onApply: vi.fn(), onDelete: vi.fn(), onChangeDate: vi.fn(), onClose: vi.fn(), ...over }
  render(<MealSlotEditor {...props} />)
  return props
}
function add(over: Partial<MealSlotEditorProps> = {}) {
  const props = { open: true, members, onSave: vi.fn(), onClose: vi.fn(), ...over }
  render(<MealSlotEditor {...props} />)
  return props
}
const dialog = () => screen.getByRole('dialog', { name: /Meal Slot$/ })
const pressed = (group: string) =>
  within(screen.getByRole('group', { name: group })).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'))

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
})

describe('the footer: Cancel and Save, no Close (R-B)', () => {
  it('adding: an outlined Cancel and the primary Save Meal Slot, and no Close button', () => {
    add()
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(dialog()).getByRole('button', { name: 'Save Meal Slot' })).toHaveAttribute('data-variant', 'primary')
    expect(within(dialog()).queryByRole('button', { name: 'Close' })).toBeNull()
  })
  it('editing: the same, and Remove is not a button of the footer', () => {
    edit()
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: 'Close' })).toBeNull()
    expect(within(dialog()).queryByRole('button', { name: 'Remove Meal Slot' })).toBeNull()
    expect(within(dialog()).queryByRole('button', { name: 'Change a date' })).toBeNull()
  })
  it('Save is a submit button of the sheet\'s own form (the form attribute names it), so Enter in a field saves', async () => {
    const { onSave } = add()
    const save = within(dialog()).getByRole('button', { name: 'Save Meal Slot' })
    expect(save).toHaveAttribute('type', 'submit')
    const formId = save.getAttribute('form')!
    expect(formId).toBeTruthy()
    expect(document.getElementById(formId)?.tagName).toBe('FORM')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Monday' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Tea')
    screen.getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('1600')
    await userEvent.type(screen.getByLabelText('Name'), '{Enter}')
    expect(onSave).toHaveBeenCalledTimes(1)
  })
  it('Cancel closes an untouched sheet at once', async () => {
    const { onClose } = edit()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('the ⋮ menu of an edit sheet (SHORT-02: Change a date and Remove Meal Slot)', () => {
  it('is the first control of the footer, named "More for Dinner", and opens a menu', async () => {
    edit()
    const more = within(dialog()).getByRole('button', { name: 'More for Dinner' })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    const footerButtons = [...(more.closest('.form-actions, .sheet__footer') as HTMLElement).querySelectorAll('button')]
    expect(footerButtons[0]).toBe(more)
  })
  it('lists Change a date and, last, Remove Meal Slot in the danger tone', async () => {
    edit()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'More for Dinner' }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Change a date', 'Remove Meal Slot'])
    expect(items[1]).toHaveAttribute('data-tone', 'danger')
  })
  it('Change a date opens the one-date Attendance; Remove asks the page to remove (its confirm is the page\'s)', async () => {
    const { onChangeDate, onDelete } = edit()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'More for Dinner' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Change a date' }))
    expect(onChangeDate).toHaveBeenCalledTimes(1)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'More for Dinner' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove Meal Slot' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
  it('without the handlers there is no menu item for them; adding has no ⋮ at all', async () => {
    add()
    expect(within(dialog()).queryByRole('button', { name: /^More for/ })).toBeNull()
  })
  it('a plain edit without onDelete lists only Change a date', async () => {
    edit({ onDelete: undefined })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'More for Dinner' }))
    expect((await screen.findAllByRole('menuitem')).map((i) => i.textContent)).toEqual(['Change a date'])
  })
  it('Remove is disabled in the menu while a save is running', async () => {
    edit({ saving: true })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'More for Dinner' }))
    expect(await screen.findByRole('menuitem', { name: 'Remove Meal Slot' })).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('leaving with unsaved changes (SAFE-04)', () => {
  it('an edited name makes Cancel ask "Discard changes?"; Keep editing stays, Discard closes', async () => {
    const { onClose } = edit()
    await userEvent.type(screen.getByLabelText('Name'), 'X')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    const ask = await screen.findByRole('dialog', { name: 'Discard changes?' })
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', { name: 'Discard changes' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('Escape on a sheet with a changed weekday asks too', async () => {
    const { onClose } = edit()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Monday' }))
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
  it('a new sheet where nothing was typed closes without asking', async () => {
    const { onClose } = add()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull()
  })
})

// SET-14h (decision SET 5): the page hands the sheet the weekdays "Apply to" starts with.
describe('Apply to starts with the weekdays the page gives (SET-14h)', () => {
  it('without initialWeekdays it starts with the slot\'s own day (a strip cell)', () => {
    edit()
    expect(pressed('Apply to')).toEqual(['Tuesday'])
  })
  it('with every day it starts with all seven chosen, and the summary says so', () => {
    edit({ initialWeekdays: [1, 2, 3, 4, 5, 6, 7] })
    expect(pressed('Apply to')).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    expect(screen.getByText(/^Update Dinner on /)).toHaveTextContent(/Mon.*Sun|Every day/)
  })
  it('a time change from that start is ONE batch for all seven days', async () => {
    const { onApply } = edit({ initialWeekdays: [1, 2, 3, 4, 5, 6, 7] })
    screen.getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('2000')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save Meal Slot' }))
    expect(onApply).toHaveBeenCalledWith({ match: 'Dinner', weekdays: [1, 2, 3, 4, 5, 6, 7], set: { time: '20:00' } })
  })
  it('starting with all days is not an unsaved change', async () => {
    const { onClose } = edit({ initialWeekdays: [1, 2, 3, 4, 5, 6, 7] })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// B9-16 focusFirstInvalid: a refused Save marks the field, says why under it and moves focus there.
describe('a refused Save focuses the field that is wrong', () => {
  it('no name: the Name field is aria-invalid, described by its message, and has focus', async () => {
    add({ defaultWeekdays: [1] })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save Meal Slot' }))
    const name = screen.getByLabelText('Name')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Enter a name for the Meal Slot.')
    expect(name).toHaveFocus()
  })
  it('no time: the time field is the one invalid, and the Name is not', async () => {
    add({ defaultWeekdays: [1] })
    await userEvent.type(screen.getByLabelText('Name'), 'Tea')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save Meal Slot' }))
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('group', { name: 'Usual time' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('spinbutton', { name: 'Hour' })).toHaveFocus()
  })
  it('the message is under the field, not a loose alert at the foot of the sheet', async () => {
    add({ defaultWeekdays: [1] })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save Meal Slot' }))
    expect(dialog().querySelector('.settings__error')).toBeNull()
    expect(within(dialog()).getByText('Enter a name for the Meal Slot.').closest('.ui-field')).not.toBeNull()
  })
})
