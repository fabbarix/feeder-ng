import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { householdSettings } from './fixtures'
import { HouseholdSettingsForm } from './HouseholdSettingsForm'

const field = (name: string) => screen.getByLabelText(name)

async function replace(label: string, text: string) {
  const el = field(label)
  await userEvent.clear(el)
  if (text) await userEvent.type(el, text)
}

describe('HouseholdSettingsForm', () => {
  it('has no native number, time or range input (NumberField, TimeField, Slider)', () => {
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={() => {}} />)
    expect(document.querySelector('input[type=number], input[type=time], input[type=range], select')).toBeNull()
    expect(field('Planning Horizon (days)')).toHaveAttribute('role', 'spinbutton')
  })

  it('bounds the Planning Horizon to 1-28 in the field itself (QA)', () => {
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={() => {}} />)
    expect(field('Planning Horizon (days)')).toHaveAttribute('aria-valuemin', '1')
    expect(field('Planning Horizon (days)')).toHaveAttribute('aria-valuemax', '28')
  })

  it('clamps a typed Planning Horizon of 40 to 28 instead of saving it', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    await replace('Planning Horizon (days)', '40')
    await userEvent.tab()
    expect(field('Planning Horizon (days)')).toHaveValue('28')
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ planningHorizonDays: 28 }))
  })

  it('shows the current values', () => {
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={() => {}} />)
    expect(field('Time zone')).toHaveValue('Europe/Rome')
    expect(field('Planning Horizon (days)')).toHaveValue('7')
    expect(field('Default Cool-down (days)')).toHaveValue('7')
    expect(field('Default Leftover Use-by (days)')).toHaveValue('3')
    const start = screen.getByRole('group', { name: 'Quiet hours start' })
    expect(within(start).getByRole('spinbutton', { name: 'Hour' })).toHaveValue('22')
    expect(within(start).getByRole('spinbutton', { name: 'Minute' })).toHaveValue('00')
    const end = screen.getByRole('group', { name: 'Quiet hours end' })
    expect(within(end).getByRole('spinbutton', { name: 'Hour' })).toHaveValue('07')
    expect(field('Location')).toHaveValue('Turin')
    expect(field('Currency')).toHaveValue('USD')
    expect(screen.getByRole('slider', { name: 'Planner Style' })).toHaveAttribute('aria-valuetext', 'Variety')
  })

  it('is read-only without edit rights: disabled fields and no save button', () => {
    render(<HouseholdSettingsForm value={householdSettings} canEdit={false} onSave={() => {}} />)
    expect(field('Planning Horizon (days)')).toBeDisabled()
    expect(field('Currency')).toBeDisabled()
    expect(screen.getByRole('slider', { name: 'Planner Style' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('button', { name: 'Save Household settings' })).toBeNull()
  })

  it('saves the edited settings', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    await replace('Planning Horizon (days)', '14')
    await userEvent.tab()
    screen.getByRole('slider', { name: 'Planner Style' }).focus() // the anchor chips went (R2-3, F-06); End jumps to Favourites
    await userEvent.keyboard('{End}')
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(onSave).toHaveBeenCalledWith({
      timeZone: 'Europe/Rome',
      planningHorizonDays: 14,
      defaultCooldownDays: 7,
      defaultLeftoverUseByDays: 3,
      quietHours: { start: '22:00', end: '07:00' },
      plannerStyle: 1,
      location: { city: 'Turin' },
      currency: 'USD',
    })
  })

  it('reads a Location typed as coordinates, and an empty one as none', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    await replace('Location', '45.07, 7.69')
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ location: { latitude: 45.07, longitude: 7.69 } }))
    await replace('Location', '')
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ location: null }))
  })

  it('upper-cases the Currency', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    await replace('Currency', 'eur')
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ currency: 'EUR' }))
  })

  it('edits quiet hours', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    const start = screen.getByRole('group', { name: 'Quiet hours start' })
    within(start).getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('2330')
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quietHours: { start: '23:30', end: '07:00' } }))
  })

  it('offers the browser time zone on first setup', () => {
    const first = { ...householdSettings, timeZone: 'UTC', timeZoneConfigured: false }
    render(<HouseholdSettingsForm value={first} canEdit suggestedTimeZone="Europe/Rome" onSave={() => {}} />)
    expect(field('Time zone')).toHaveValue('Europe/Rome')
    expect(screen.getByText(/from your browser/i)).toBeInTheDocument()
  })

  it('keeps the stored time zone once configured', () => {
    render(<HouseholdSettingsForm value={householdSettings} canEdit suggestedTimeZone="Asia/Tokyo" onSave={() => {}} />)
    expect(field('Time zone')).toHaveValue('Europe/Rome')
    expect(screen.queryByText(/from your browser/i)).toBeNull()
  })

  it('shows a busy save button while saving', () => {
    render(<HouseholdSettingsForm value={householdSettings} canEdit saving onSave={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save Household settings' })).toBeDisabled()
  })
})
