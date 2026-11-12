// QA-2: /settings/notifications is built on the shared page like the other Settings pages. The shell already provides the one <main>;
// the screen composes ListPage + PageHeader and has no root of its own (no .notifications root, no local padding or max width).
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { NotificationSettingsScreen } from './NotificationSettingsScreen'

afterEach(() => vi.unstubAllGlobals())

describe('NotificationSettingsScreen layout', () => {
  it('renders no <main> of its own, in the loading state and once loaded', async () => {
    mockApi({})
    const { container } = renderWithProviders(<NotificationSettingsScreen />, '/settings/notifications')
    expect(container.querySelector('main')).toBeNull()
    await screen.findByRole('heading', { level: 1, name: 'Notifications' })
    expect(container.querySelector('main')).toBeNull()
  })

  it('composes the shared ListPage: its root is .list-page, with the PageHeader in the header slot', () => {
    mockApi({})
    const { container } = renderWithProviders(<NotificationSettingsScreen />, '/settings/notifications')
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('list-page')
    expect(root.querySelector('.list-page__header .page-header')).not.toBeNull()
    expect(container.querySelector('.list-page__list .tile, .list-page__list [class*="tile"]')).not.toBeNull()
  })

  it('has no screen root class of its own (.notifications)', () => {
    mockApi({})
    const { container } = renderWithProviders(<NotificationSettingsScreen />, '/settings/notifications')
    expect(container.querySelector('.notifications')).toBeNull()
  })
})
