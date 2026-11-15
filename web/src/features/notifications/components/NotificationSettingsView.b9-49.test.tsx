// B9-49: SET-14g (the iPhone Safari line) and TB-15a (the Turn on button is full width on a phone, natural width from 600 px).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { notificationStrings } from '../strings'
import { NotificationSettingsView, type NotificationSettingsViewProps } from './NotificationSettingsView'

const base: NotificationSettingsViewProps = {
  support: 'supported',
  quietHours: undefined,
  thisDevice: undefined,
  otherDevices: [],
  busy: false,
  onEnable: vi.fn(),
  onDisable: vi.fn(),
  onSetType: vi.fn(),
  onRemove: vi.fn(),
}
const IOS_LINE = 'Safari on iPhone sends notifications only to Feeder added to the Home Screen. Use Share, then Add to Home Screen, then open Feeder from there.'
const OLD_LINE = 'On iPhone and iPad, add Feeder to your Home Screen first, then open it from there to turn on notifications.'

describe('SET-14g: the needs-install line', () => {
  it('iOS Safari reads the Safari line (Share, then Add to Home Screen, then open Feeder from there)', () => {
    render(<NotificationSettingsView {...base} support="needs-install" iosSafari />)
    expect(screen.getByText(IOS_LINE)).toBeInTheDocument()
    expect(notificationStrings.needsInstallIosSafari).toBe(IOS_LINE)
  })

  it('every other browser keeps the old line', () => {
    render(<NotificationSettingsView {...base} support="needs-install" iosSafari={false} />)
    expect(screen.getByText(OLD_LINE)).toBeInTheDocument()
    expect(screen.queryByText(IOS_LINE)).toBeNull()
  })

  it('the prop is optional: left out it is the old line', () => {
    render(<NotificationSettingsView {...base} support="needs-install" />)
    expect(screen.getByText(OLD_LINE)).toBeInTheDocument()
  })

  it('the Safari line is for the needs-install state only', () => {
    render(<NotificationSettingsView {...base} support="denied" iosSafari />)
    expect(screen.queryByText(IOS_LINE)).toBeNull()
  })
})

describe('TB-15a: Turn on notifications on this device', () => {
  it('is a block="phone" button: full width below 600 px, natural width from 600 px (data-block="phone")', () => {
    render(<NotificationSettingsView {...base} />)
    expect(screen.getByRole('button', { name: 'Turn on notifications on this device' })).toHaveAttribute('data-block', 'phone')
  })

  it('also while it is busy ("Turning on")', () => {
    render(<NotificationSettingsView {...base} busy />)
    expect(screen.getByRole('button', { name: 'Turning on' })).toHaveAttribute('data-block', 'phone')
  })
})
