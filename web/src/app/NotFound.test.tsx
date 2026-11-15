import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { buildRoutes, type FeatureModule } from './features'

// B9-25 (PC-04): the shell's timer pill polls the household's timers through react-query; the shell tests have no QueryClient (AppShell.timers.test.tsx covers it).
vi.mock('./ShellTimers', () => ({ ShellTimers: () => null, ShellTimerAlert: () => null }))

vi.mock('./ShellStatus', () => ({ ShellStatus: () => null }))

function at(path: string, mods: Record<string, FeatureModule> = {}) {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} />, children: buildRoutes(mods) }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('not-found route (B12)', () => {
  it('buildRoutes ends with a catch-all route', () => {
    const routes = buildRoutes({})
    expect(routes[routes.length - 1]?.path).toBe('*')
  })

  it.each(['/nope', '/plan/does-not-exist', '/recipes/1/2/3/4'])('%s shows the Page not found state inside the shell, not the router error page', (path) => {
    at(path, { '../features/x/index.ts': { routes: [{ path: '/recipes/:id', element: <p>recipe</p> }] } })
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Page not found' }))
    expect(screen.getByText('That page does not exist or has moved.')).toBeInTheDocument()
    expect(screen.queryByText(/Unexpected Application Error/i)).toBeNull()
    expect(screen.queryByText(/404 Not Found/i)).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Bottom bar' })).toBeInTheDocument()
  })

  it('the page has one h1, "Page not found", and the document title "Page not found · Feeder" (A11Y-01)', () => {
    at('/nope')
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(document.title).toBe('Page not found · Feeder')
  })

  it('the "Go to Today" button leads back to Today', async () => {
    const router = at('/nope')
    await userEvent.click(screen.getByRole('button', { name: 'Go to Today' }))
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })

  it('no nav tab is current on an unknown page', () => {
    at('/nope')
    expect(screen.getByRole('navigation', { name: 'Bottom bar' }).querySelector('[aria-current]')).toBeNull()
  })

  it('an unknown page under /board is also handled, without the bars (chromeless)', () => {
    at('/board/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).toBeNull()
  })

  it('real routes still win over the catch-all', () => {
    at('/shop')
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Shop' })).toBeInTheDocument()
  })
})
