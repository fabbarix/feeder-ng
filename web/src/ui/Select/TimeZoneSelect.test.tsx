// B9-15 (SET-07): a searchable TimeZoneSelect replaces the free-text Time zone (where "Rome" was refused).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TimeZoneSelect } from './TimeZoneSelect'

const NOW = new Date('2026-11-14T20:14:00Z')
const zones = ['Europe/Rome', 'Europe/London', 'Europe/Paris', 'America/New_York', 'Asia/Kolkata', 'UTC']
const setup = (props: Record<string, unknown> = {}) => {
  const onChange = vi.fn()
  render(<TimeZoneSelect value="Europe/London" onChange={onChange} zones={zones} now={NOW} deviceZone="Europe/Rome" {...props} />)
  return onChange
}

describe('TimeZoneSelect', () => {
  it('is a combobox named "Time zone" whose trigger reads "Rome · Europe/Rome" for the Household zone', () => {
    setup({ value: 'Europe/Rome' })
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveTextContent('Rome · Europe/Rome')
  })
  it('is searchable whatever the number of zones', async () => {
    setup({ zones: ['Europe/Rome', 'UTC'] })
    await userEvent.click(screen.getByRole('combobox', { name: 'Time zone' }))
    // The open Select's search field is a searchbox (the trigger is the one combobox, as Select.keys.test pins).
    expect(screen.getByRole('searchbox', { name: /Search/ })).toBeInTheDocument()
  })
  it('An Admin finds Rome by typing "Rom" and picks it', async () => {
    const onChange = setup()
    await userEvent.click(screen.getByRole('combobox', { name: 'Time zone' }))
    await userEvent.keyboard('Rom')
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getAllByRole('option')).toHaveLength(1)
    await userEvent.click(within(listbox).getByRole('option', { name: 'Rome' }))
    expect(onChange).toHaveBeenCalledWith('Europe/Rome')
  })
  it('an option is described by its offset, time and IANA name, in that order', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox', { name: 'Time zone' }))
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'London' })).toHaveAccessibleDescription('UTC+0 · 20:14 · Europe/London')
  })
  it('lists "This device" first, then the regions', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox', { name: 'Time zone' }))
    const groups = within(screen.getByRole('listbox')).getAllByRole('group').map((g) => g.getAttribute('aria-label') ?? g.firstElementChild?.textContent)
    expect(groups.slice(0, 2)).toEqual(['This device', 'Europe'])
  })
  it('shows the given helper and error under the field (the field label, helper and error take the full track)', () => {
    setup({ helper: 'Today, the Plan and notifications use it.', error: 'Choose a time zone' })
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveAccessibleDescription(/Today, the Plan and notifications use it\./)
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveAttribute('aria-invalid', 'true')
  })
  it('a stored zone outside the list still shows in the trigger', () => {
    setup({ value: 'Etc/Weird' })
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveTextContent('Weird')
  })
  it('the label may be changed', () => {
    setup({ label: 'Zone' })
    expect(screen.getByRole('combobox', { name: 'Zone' })).toBeInTheDocument()
  })
})
