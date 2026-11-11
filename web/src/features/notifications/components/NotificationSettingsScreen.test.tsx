// R11a: /settings/notifications has a PageHeader (Breadcrumbs Settings > Notifications above the h1), in every state.
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { NotificationSettingsScreen } from './NotificationSettingsScreen'

afterEach(() => vi.unstubAllGlobals())

describe('NotificationSettingsScreen', () => {
  it('shows Settings > Notifications above its h1, and it stays once loading has finished', async () => {
    mockApi({})
    const { container } = renderWithProviders(<NotificationSettingsScreen />, '/settings/notifications')
    const h1 = screen.getByRole('heading', { level: 1, name: 'Notifications' })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.querySelector('a[href="/settings"]')).toHaveTextContent('Settings')
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Notifications')
    expect(container.querySelector('.page-header')).toContainElement(nav)
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^back to/i })).toBeNull()
    // still there once the load has failed
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
  })
})
