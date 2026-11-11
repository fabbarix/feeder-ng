import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PushDevice } from '../types'
import { NotificationSettingsView, type NotificationSettingsViewProps } from './NotificationSettingsView'

const flags = { advanceStep: false, startCooking: false, confirmCooked: false, leftoverUseBy: false, stockSpoil: false, timerFinished: false, accessRequest: false }
const mine: PushDevice = { id: 1, label: 'Pixel', createdAt: '2026-11-09T12:00:00Z', endpointHash: 'aa', types: { ...flags, advanceStep: true, timerFinished: true } }
const tablet: PushDevice = { id: 2, label: 'Kitchen tablet', createdAt: '2026-11-08T12:00:00Z', endpointHash: 'bb', types: { ...flags } }

function setup(over: Partial<NotificationSettingsViewProps> = {}) {
  const props: NotificationSettingsViewProps = {
    support: 'supported',
    quietHours: { start: '22:00', end: '07:00' },
    thisDevice: mine,
    otherDevices: [tablet],
    busy: false,
    onEnable: vi.fn(),
    onDisable: vi.fn(),
    onSetType: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  }
  render(<NotificationSettingsView {...props} />)
  return props
}

describe('NotificationSettingsView', () => {
  it('shows a switch per type for this device, on where the device has it on', () => {
    setup()
    const names = ['Advance Step due', 'Start cooking', 'Confirm Cooked', 'Leftover Use-by', 'Stock about to spoil', 'Timer finished']
    for (const name of names) expect(screen.getByRole('switch', { name })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Advance Step due' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Timer finished' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Start cooking' })).not.toBeChecked()
  })

  it('flips a type for this device', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('switch', { name: 'Stock about to spoil' }))
    expect(props.onSetType).toHaveBeenCalledWith(1, 'stockSpoil', true)
    await userEvent.click(screen.getByRole('switch', { name: 'Advance Step due' }))
    expect(props.onSetType).toHaveBeenCalledWith(1, 'advanceStep', false)
  })

  it('explains the quiet hours and the Timer finished exception', () => {
    setup()
    expect(screen.getByText('No notifications between 22:00 and 07:00, except Timer finished.')).toBeInTheDocument()
  })

  it('offers to turn notifications on when this device is not registered', async () => {
    const props = setup({ thisDevice: undefined })
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Turn on notifications on this device' }))
    expect(props.onEnable).toHaveBeenCalledTimes(1)
  })

  it('disables the turn-on button while busy', () => {
    setup({ thisDevice: undefined, busy: true })
    expect(screen.getByRole('button', { name: /Turning on|Turn on notifications/ })).toBeDisabled()
  })

  it('turns notifications off on this device', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Turn off notifications on this device' }))
    expect(props.onDisable).toHaveBeenCalledTimes(1)
  })

  it('lists other devices with a remove button each', async () => {
    const props = setup()
    expect(screen.getByRole('heading', { name: 'Your other devices' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Kitchen tablet' }))
    expect(props.onRemove).toHaveBeenCalledWith(2)
  })

  it('has no other-devices section when there are none', () => {
    setup({ otherDevices: [] })
    expect(screen.queryByRole('heading', { name: 'Your other devices' })).not.toBeInTheDocument()
  })

  it.each([
    ['unsupported', 'This browser cannot receive push notifications.'],
    ['needs-install', 'On iPhone and iPad, add Feeder to your Home Screen first, then open it from there to turn on notifications.'],
    ['denied', 'Notifications are blocked for Feeder in this browser. Allow them in the browser settings, then come back.'],
  ] as const)('%s shows its message and no controls', (support, message) => {
    setup({ support, thisDevice: undefined, otherDevices: [] })
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Turn on/ })).not.toBeInTheDocument()
  })
})
