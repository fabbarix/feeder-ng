// R11a sweep: every route the Settings index links to shows Breadcrumbs (Settings > its title) above its h1, and no back link.
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

describe('Settings index sub-pages', () => {
  const paths = settingsGroups(true).flatMap((g) => g.sections.map((s) => s.path))
  const all = [...settingsRoutes, ...planRoutes, ...shopsRoutes, ...notificationRoutes]

  it('every index path has a route', () => {
    for (const path of paths) expect(all.some((r) => r.path === path), path).toBe(true)
  })

  it.each(paths)('%s shows Settings > its title above the h1', async (path) => {
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
    const h1 = await screen.findByRole('heading', { level: 1 })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.querySelector('a[href="/settings"]')).toHaveTextContent('Settings')
    expect(nav.querySelectorAll('a')).toHaveLength(1)
    // the last crumb is the page's own title: one name for the page in nav, index row and heading
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent(h1.textContent ?? '')
    expect(container.querySelector('.page-header')).toContainElement(nav)
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // no back link and no BackLink markup anywhere on the page
    expect(screen.queryAllByRole('link', { name: /^back to/i })).toHaveLength(0)
    expect(container.querySelector('.back-link')).toBeNull()
  })
})
