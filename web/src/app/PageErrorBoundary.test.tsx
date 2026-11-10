import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { RouteErrorBoundary } from './PageErrorBoundary'

vi.mock('./ShellStatus', () => ({ ShellStatus: () => null }))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

function Boom(): never {
  throw new Error('kaboom')
}

describe('PageErrorBoundary inside the shell (B12)', () => {
  function mount() {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} />,
          children: [
            { path: 'plan', element: <Boom /> },
            { path: 'shop', element: <h1>Shop page</h1> },
          ],
        },
      ],
      { initialEntries: ['/plan'] },
    )
    render(<RouterProvider router={router} />)
    return router
  }

  it('shows a friendly error state, never the router dev error page or the stack', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('Feeder could not show this page. Your data is safe.')).toBeInTheDocument()
    expect(screen.queryByText(/kaboom/)).toBeNull()
    expect(screen.queryByText(/Unexpected Application Error/i)).toBeNull()
    expect(screen.queryByText(/Hey developer/i)).toBeNull()
  })

  it('keeps the navigation working and recovers when the User navigates away', async () => {
    mount()
    const bar = screen.getByRole('navigation', { name: 'Bottom bar' })
    await userEvent.click(within(bar).getByRole('link', { name: 'Shop' }))
    expect(screen.getByRole('heading', { name: 'Shop page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).toBeNull()
  })

  it('offers Reload page and Go to Today', async () => {
    const router = mount()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go to Today' }))
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('RouteErrorBoundary as a router errorElement (outside the shell)', () => {
  const at = (loader: () => never) => {
    const router = createMemoryRouter(
      [{ path: '/', loader, element: <p>fine</p>, errorElement: <RouteErrorBoundary /> }],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)
  }

  it('shows Something went wrong for a thrown Error', async () => {
    at(() => {
      throw new Error('loader failed')
    })
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.queryByText(/loader failed/)).toBeNull()
  })

  it('shows Page not found for a thrown 404 response', async () => {
    at(() => {
      throw new Response('', { status: 404 })
    })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
