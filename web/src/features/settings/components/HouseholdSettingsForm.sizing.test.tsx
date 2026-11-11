// R2-3 (ui-review-2 F-01 adoption, L-06, F-03): the Household form uses field sizes, FieldRow and FormActions.
//   Time zone md . Planning Horizon / Cool-down / Leftover Use-by xs, side by side in one FieldRow . Quiet hours start+end sm in one
//   FieldRow . Location lg . Currency xs . "Save household settings" in FormActions (auto width from 600 px), only for an Admin.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { householdSettings } from './fixtures'
import { HouseholdSettingsForm } from './HouseholdSettingsForm'

const frame = (el: HTMLElement) => el.closest('[data-size]')
const sizeOf = (el: HTMLElement) => frame(el)?.getAttribute('data-size')
const rowOf = (el: HTMLElement) => el.closest('.field-row')

function setup(canEdit = true) {
  return render(<HouseholdSettingsForm value={householdSettings} canEdit={canEdit} onSave={() => {}} />)
}

describe('HouseholdSettingsForm sizing (R2-3)', () => {
  it('sizes each field to its value', () => {
    setup()
    expect(sizeOf(screen.getByLabelText('Time zone'))).toBe('md')
    expect(sizeOf(screen.getByLabelText('Planning Horizon (days)'))).toBe('xs')
    expect(sizeOf(screen.getByLabelText('Default Cool-down (days)'))).toBe('xs')
    expect(sizeOf(screen.getByLabelText('Default Leftover Use-by (days)'))).toBe('xs')
    expect(sizeOf(screen.getByRole('group', { name: 'Quiet hours start' }))).toBe('sm')
    expect(sizeOf(screen.getByRole('group', { name: 'Quiet hours end' }))).toBe('sm')
    expect(sizeOf(screen.getByLabelText('Location'))).toBe('lg')
    expect(sizeOf(screen.getByLabelText('Currency'))).toBe('xs')
  })

  it('puts the three day counts on one FieldRow, and the quiet hours on another', () => {
    setup()
    const horizon = rowOf(screen.getByLabelText('Planning Horizon (days)'))
    expect(horizon).not.toBeNull()
    expect(rowOf(screen.getByLabelText('Default Cool-down (days)'))).toBe(horizon)
    expect(rowOf(screen.getByLabelText('Default Leftover Use-by (days)'))).toBe(horizon)
    const quiet = rowOf(screen.getByRole('group', { name: 'Quiet hours start' }))
    expect(quiet).not.toBeNull()
    expect(rowOf(screen.getByRole('group', { name: 'Quiet hours end' }))).toBe(quiet)
    expect(quiet).not.toBe(horizon)
  })

  it('has no hand-rolled flex row any more (.settings__row--wrap-start is replaced by FieldRow)', () => {
    const { container } = setup()
    expect(container.querySelector('.settings__row')).toBeNull()
  })

  it('puts Save household settings in FormActions for an Admin, and shows none otherwise', () => {
    const { unmount } = setup()
    expect(screen.getByRole('button', { name: 'Save household settings' }).closest('.form-actions__primary')).not.toBeNull()
    unmount()
    setup(false)
    expect(screen.queryByRole('button', { name: 'Save household settings' })).toBeNull()
    expect(document.querySelector('.form-actions')).toBeNull()
  })
})
