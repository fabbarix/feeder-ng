// B9-49 (SET-14g): the screen decides "iOS Safari" from the browser's user agent and tells the view.
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../settings/test-utils'
import { NotificationSettingsScreen } from './NotificationSettingsScreen'

vi.mock('../hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ loading: false, error: false, support: 'needs-install', config: undefined, thisDevice: undefined, otherDevices: [], busy: false, enable: vi.fn(), disable: vi.fn(), setType: vi.fn(), removeDevice: vi.fn() }),
}))
afterEach(() => vi.restoreAllMocks())

const withUserAgent = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)

describe('NotificationSettingsScreen on iPhone Safari', () => {
  it('shows the Safari line there', () => {
    withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')
    renderWithProviders(<NotificationSettingsScreen />, '/settings/notifications')
    expect(screen.getByText(/^Safari on iPhone sends notifications only to Feeder added to the Home Screen/)).toBeInTheDocument()
  })

  it('and the old line in another browser', () => {
    withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1')
    renderWithProviders(<NotificationSettingsScreen />, '/settings/notifications')
    expect(screen.getByText(/^On iPhone and iPad, add Feeder to your Home Screen first/)).toBeInTheDocument()
  })
})
