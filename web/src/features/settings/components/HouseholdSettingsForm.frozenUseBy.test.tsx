// B5-LOW: the Household's default Frozen Use-by (whole days 1 to 365; Admin) in Settings > Household.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { HouseholdSettings } from '../types'
import { householdSettings } from './fixtures'
import { HouseholdSettingsForm } from './HouseholdSettingsForm'

const value = { ...householdSettings, frozenUseByDays: 90 } as HouseholdSettings
const field = () => screen.getByLabelText('Default Frozen Use-by (days)')

describe('HouseholdSettingsForm: Frozen Use-by', () => {
  it('shows the current default, bounded 1 to 365 in the field itself', () => {
    render(<HouseholdSettingsForm value={value} canEdit onSave={() => {}} />)
    expect(field()).toHaveValue('90')
    expect(field()).toHaveAttribute('role', 'spinbutton')
    expect(field()).toHaveAttribute('aria-valuemin', '1')
    expect(field()).toHaveAttribute('aria-valuemax', '365')
  })
  it('saves a changed value with the other settings', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={value} canEdit onSave={onSave} />)
    await userEvent.clear(field())
    await userEvent.type(field(), '120')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ frozenUseByDays: 120, planningHorizonDays: 7 }))
  })
  it('clamps a typed 400 to 365 instead of saving it', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={value} canEdit onSave={onSave} />)
    await userEvent.clear(field())
    await userEvent.type(field(), '400')
    await userEvent.tab()
    expect(field()).toHaveValue('365')
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ frozenUseByDays: 365 }))
  })
  it('is read-only without edit rights', () => {
    render(<HouseholdSettingsForm value={value} canEdit={false} onSave={() => {}} />)
    expect(field()).toBeDisabled()
  })
})
