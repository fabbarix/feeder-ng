// R11a N8 sweep: every route the Settings index links to renders the shared BackLink in its header's leading slot.
import { screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { routes as notificationRoutes } from '../../notifications'
import { routes as planRoutes } from '../../plan'
import { routes as shopsRoutes } from '../../shops'
import { routes as settingsRoutes } from '../index'
import { ADMIN_ME, mockApi, newQueryClient } from '../test-utils'
import { settingsGroups } from './settingsSections'

afterEach(() => vi.unstubAllGlobals())

// Sub-pages reached from the index (everything except the index itself) and the back target each must offer.
const BACK_TO_SETTINGS = 'Back to Settings'

describe('Settings index sub-pages', () => {
  const paths = settingsGroups(true).flatMap((g) => g.sections.map((s) => s.path))
  const all = [...settingsRoutes, ...planRoutes, ...shopsRoutes, ...notificationRoutes]

  it('every index path has a route', () => {
    for (const path of paths) expect(all.some((r) => r.path === path), path).toBe(true)
  })

  it.each(paths)('%s leads its header with the shared back control to Settings', async (path) => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    const router = createMemoryRouter(all, { initialEntries: [path] })
    const { container } = render(
      <QueryClientProvider client={newQueryClient()}>
        <ToastProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>,
    )
    const back = await screen.findByRole('link', { name: BACK_TO_SETTINGS })
    expect(back).toHaveAttribute('href', '/settings')
    expect(back).toHaveClass('back-link')
    expect(container.querySelector('.page-header__leading')).toContainElement(back)
    // no other "Back to ..." link on the page, and no old plain-text one
    expect(screen.getAllByRole('link', { name: /^back to/i })).toHaveLength(1)
  })
})
