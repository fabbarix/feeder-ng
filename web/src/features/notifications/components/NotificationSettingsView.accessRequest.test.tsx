// A1 phase 2 (spec 12): the new push type `accessRequest` ("when someone asks to sign in") has a switch on this device,
// off unless the device opted in, like every type. The Developer widens NotificationType / NOTIFICATION_TYPES / TypeFlags
// (after timerFinished) and the fixtures of the older tests.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { notificationStrings } from '../strings'
import { NOTIFICATION_TYPES, type PushDevice } from '../types'
import { NotificationSettingsView, type NotificationSettingsViewProps } from './NotificationSettingsView'

const flags = { advanceStep: false, startCooking: false, confirmCooked: false, leftoverUseBy: false, stockSpoil: false, timerFinished: false, accessRequest: false }
const device = (on: Partial<typeof flags> = {}): PushDevice => ({ id: 1, label: 'Pixel', createdAt: '2026-11-09T12:00:00Z', endpointHash: 'aa', types: { ...flags, ...on } })

function setup(thisDevice: PushDevice, over: Partial<NotificationSettingsViewProps> = {}) {
  const props: NotificationSettingsViewProps = {
    support: 'supported', quietHours: { start: '22:00', end: '07:00' }, thisDevice, otherDevices: [], busy: false,
    onEnable: vi.fn(), onDisable: vi.fn(), onSetType: vi.fn(), onRemove: vi.fn(), ...over,
  }
  render(<NotificationSettingsView {...props} />)
  return props
}

describe('NotificationSettingsView: Sign-in request type', () => {
  it('is a known type, last in the list', () => {
    expect([...NOTIFICATION_TYPES]).toContain('accessRequest')
    expect(NOTIFICATION_TYPES.at(-1)).toBe('accessRequest')
  })

  it('has a label and a hint, with GLOSSARY wording and no avoided words', () => {
    const copy = (notificationStrings.types as Record<string, { label: string; hint: string }>).accessRequest!
    expect(copy.label).toBe('Sign-in request')
    expect(copy.hint).toBe('When someone asks to sign in and waits for approval')
    expect(`${copy.label} ${copy.hint}`).not.toMatch(/invite|signup|join request/i)
  })

  it('shows a switch named "Sign-in request", off by default', () => {
    setup(device())
    expect(screen.getByRole('switch', { name: 'Sign-in request' })).not.toBeChecked()
    expect(screen.getByText('When someone asks to sign in and waits for approval')).toBeInTheDocument()
  })

  it('is on when the device has it on', () => {
    setup(device({ accessRequest: true }))
    expect(screen.getByRole('switch', { name: 'Sign-in request' })).toBeChecked()
  })

  it('flips the type for this device', async () => {
    const props = setup(device())
    await userEvent.click(screen.getByRole('switch', { name: 'Sign-in request' }))
    expect(props.onSetType).toHaveBeenCalledWith(1, 'accessRequest', true)
  })

  it('lists all seven switches', () => {
    setup(device())
    expect(screen.getAllByRole('switch')).toHaveLength(7)
  })

  it('the quiet-hours note still names Timer finished as the only exception (a sign-in request waits for the morning)', () => {
    setup(device())
    expect(screen.getByText('No notifications between 22:00 and 07:00, except Timer finished.')).toBeInTheDocument()
  })
})
