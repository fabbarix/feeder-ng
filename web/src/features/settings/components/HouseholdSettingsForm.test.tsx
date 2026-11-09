import { fireEvent, render, screen } from '@testing-library/react'
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
  it('shows the current values', () => {
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={() => {}} />)
    expect(field('Time zone')).toHaveValue('Europe/Rome')
    expect(field('Planning Horizon (days)')).toHaveValue(7)
    expect(field('Default Cool-down (days)')).toHaveValue(7)
    expect(field('Default Leftover Use-by (days)')).toHaveValue(3)
    expect(field('Quiet hours start')).toHaveValue('22:00')
    expect(field('Quiet hours end')).toHaveValue('07:00')
    expect(field('Location')).toHaveValue('Turin')
    expect(field('Currency')).toHaveValue('USD')
    expect(screen.getByRole('slider', { name: 'Planner Style' })).toHaveAttribute('aria-valuetext', 'Variety')
  })

  it('is read-only without edit rights: disabled fields and no save button', () => {
    render(<HouseholdSettingsForm value={householdSettings} canEdit={false} onSave={() => {}} />)
    expect(field('Planning Horizon (days)')).toBeDisabled()
    expect(field('Currency')).toBeDisabled()
    expect(screen.getByRole('slider', { name: 'Planner Style' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save household settings' })).toBeNull()
  })

  it('saves the edited settings', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    await replace('Planning Horizon (days)', '14')
    await userEvent.click(screen.getByRole('button', { name: 'Favourites' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save household settings' }))
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

  it('refuses a Planning Horizon outside 1-28 and says why', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    await replace('Planning Horizon (days)', '29')
    await userEvent.click(screen.getByRole('button', { name: 'Save household settings' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Planning Horizon must be between 1 and 28/)
    expect(field('Planning Horizon (days)')).toHaveAttribute('aria-invalid', 'true')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reads a Location typed as coordinates, and an empty one as none', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    await replace('Location', '45.07, 7.69')
    await userEvent.click(screen.getByRole('button', { name: 'Save household settings' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ location: { latitude: 45.07, longitude: 7.69 } }))
    await replace('Location', '')
    await userEvent.click(screen.getByRole('button', { name: 'Save household settings' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ location: null }))
  })

  it('upper-cases the Currency', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    await replace('Currency', 'eur')
    await userEvent.click(screen.getByRole('button', { name: 'Save household settings' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ currency: 'EUR' }))
  })

  it('edits quiet hours', async () => {
    const onSave = vi.fn()
    render(<HouseholdSettingsForm value={householdSettings} canEdit onSave={onSave} />)
    fireEvent.change(field('Quiet hours start'), { target: { value: '23:30' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save household settings' }))
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
    expect(screen.getByRole('button', { name: 'Save household settings' })).toBeDisabled()
  })
})
