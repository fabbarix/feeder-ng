// R11a N8 (send-back): /settings/notifications has a PageHeader (h1 + shared BackLink to Settings), not a bare h1.
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { NotificationSettingsScreen } from './NotificationSettingsScreen'

afterEach(() => vi.unstubAllGlobals())

describe('NotificationSettingsScreen', () => {
  it('leads its h1 with the shared back control to Settings', async () => {
    mockApi({})
    const { container } = renderWithProviders(<NotificationSettingsScreen />, '/settings/notifications')
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument()
    const back = screen.getByRole('link', { name: 'Back to Settings' })
    expect(back).toHaveAttribute('href', '/settings')
    expect(back).toHaveClass('back-link')
    expect(container.querySelector('.page-header__leading')).toContainElement(back)
    expect(container.querySelector('.page-header')).toContainElement(screen.getByRole('heading', { level: 1 }))
    // still there once loading has finished (here: the load failed)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toBeInTheDocument()
  })
})
