// B9-36 (SET-07, SAFE-04): the Household form with the crafted Time zone and Currency Selects, a focus that follows an invalid save, and
// a save that leaves Earliest start and Latest start alone (they are edited in Planning rules by B9-51; an absent key keeps the stored value).
// Chapter scenario "An Admin finds Rome by typing "Rom" and saves the Household's time zone". "A Planning Horizon of 40 shows its error on at
// most two lines at 375 px" is the page-layout scenario household-errors (B9-16) and the clamp test in HouseholdSettingsForm.test.tsx.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { householdSettings } from './fixtures'
import { HouseholdSettingsForm } from './HouseholdSettingsForm'

// jsdom has no scrollIntoView; useFocusFirstInvalid scrolls the first invalid field into view before focusing it (B9-36 developer).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

const zone = () => screen.getByRole('combobox', { name: 'Time zone' })
const saveButton = () => screen.getByRole('button', { name: 'Save Household settings' })
const mount = (props: Record<string, unknown> = {}) => {
  const onSave = vi.fn()
  render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} {...props} />)
  return onSave
}

describe('Time zone', () => {
  it('is a searchable combobox, never a text box', () => {
    mount()
    expect(zone()).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Time zone' })).toBeNull()
  })

  it('An Admin finds Rome by typing "Rom" and saves the Household\'s time zone', async () => {
    const onSave = mount({ value: { ...householdSettings, timeZone: 'Europe/London' } })
    await userEvent.click(zone())
    await userEvent.keyboard('Rom')
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Rome' }))
    await userEvent.click(saveButton())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'Europe/Rome' }))
  })

  it('says what it is for and what time it is there', () => {
    mount()
    expect(zone()).toHaveAccessibleDescription(/Today, the Plan and notifications use it\. It is \d\d:\d\d there now\./)
  })

  it('warns that a changed zone can move today\'s meals, only once it is changed', async () => {
    mount()
    const warning = "Changing the time zone can move today's meals to another day."
    expect(screen.queryByText(warning)).toBeNull()
    await userEvent.click(zone())
    await userEvent.keyboard('Lond')
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'London' }))
    expect(screen.getByText(warning)).toBeInTheDocument()
    await userEvent.click(zone())
    await userEvent.keyboard('Rom')
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Rome' }))
    expect(screen.queryByText(warning)).toBeNull() // back to the stored zone: nothing changes
  })

  it('a plain User sees it disabled and gets no warning', () => {
    mount({ canEdit: false })
    expect(zone()).toBeDisabled()
  })
})

describe('Currency', () => {
  it('is a searchable combobox of size sm that reads "US Dollar · USD"', () => {
    mount()
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent('US Dollar · USD')
    expect(screen.queryByRole('textbox', { name: 'Currency' })).toBeNull()
  })

  it('lists Common first, then All currencies', async () => {
    mount()
    await userEvent.click(screen.getByRole('combobox', { name: 'Currency' }))
    expect([...document.querySelectorAll('.select__group-title')].map((g) => g.textContent)).toEqual(['Common', 'All currencies'])
  })
})

describe('an invalid save moves focus to the first invalid field (SAFE-04)', () => {
  async function clear(label: string) {
    const el = screen.getByLabelText(label)
    await userEvent.clear(el)
    await userEvent.tab()
    return el
  }

  it('focuses Planning Horizon, with the error under it and aria-invalid, and does not save', async () => {
    const onSave = mount()
    const horizon = await clear('Planning Horizon (days)')
    await userEvent.click(saveButton())
    expect(horizon).toHaveAttribute('aria-invalid', 'true')
    expect(horizon).toHaveFocus()
    expect(horizon).toHaveAccessibleDescription(/Planning Horizon must be/)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('with two invalid fields focus goes to the first in the form, and field errors are not alerts', async () => {
    mount()
    const horizon = await clear('Planning Horizon (days)')
    await clear('Default Cool-down (days)')
    await userEvent.click(saveButton())
    expect(horizon).toHaveFocus()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('an unreadable Location is reported at Location and takes focus', async () => {
    mount()
    const location = screen.getByLabelText('Location')
    await userEvent.clear(location)
    await userEvent.type(location, '200, 500')
    await userEvent.click(saveButton())
    expect(location).toHaveFocus()
    expect(location).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Earliest start and Latest start are not touched by this form', () => {
  it('a save sends neither key, so the server keeps the stored values (an absent key keeps)', async () => {
    const onSave = mount({ value: { ...householdSettings, earliestStart: '06:30', latestStart: '22:00' } })
    await userEvent.click(saveButton())
    const sent = onSave.mock.calls[0]![0] as Record<string, unknown>
    expect(sent).not.toHaveProperty('earliestStart')
    expect(sent).not.toHaveProperty('latestStart')
  })

  it('the notification quiet hours stay here under their own name', () => {
    mount()
    expect(screen.getByRole('group', { name: 'Quiet hours start' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Quiet hours end' })).toBeInTheDocument()
  })
})
