import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findNotice } from '../test/notices'
import { AppRoot, type AppRootProps } from './AppRoot'
import { ME_CACHE_KEY } from './meCache'

vi.mock('./useConnectivity', () => ({ useConnectivity: () => ({ offline: true, savedAt: null }) }))

afterEach(() => vi.unstubAllGlobals())

function mount(path: string, me: Response, props: AppRootProps = {}) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(me))
  // A catch-all child stands in for the signin feature's routes, which the real app mounts under AppRoot.
  const router = createMemoryRouter(
    [{ path: '/', element: <AppRoot {...props} />, children: [{ path: 'plan', element: <p>plan page</p> }, { path: '*', element: <p>other page</p> }] }],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const unauthenticated = () => new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'x' } }), { status: 401 })

describe('AppRoot signed out', () => {
  it('shows the Google sign-in page', async () => {
    mount('/', unauthenticated())
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/auth/google/login')
  })

  it('shows the Email not verified page after Google does not verify the email', async () => {
    mount('/email-not-verified', unauthenticated())
    expect(await screen.findByRole('heading', { name: 'Email not verified' })).toBeInTheDocument()
    expect(screen.getByText('Google has not verified this email. Use a different Google sign-in.')).toBeInTheDocument()
  })

  it('redirects the old /not-invited to the Email not verified page', async () => {
    mount('/not-invited', unauthenticated())
    expect(await screen.findByRole('heading', { name: 'Email not verified' })).toBeInTheDocument()
  })

  it('shows why a sign-in failed', async () => {
    mount('/sign-in?error=denied', unauthenticated())
    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled/i)
  })
})

describe('AppRoot signed in', () => {
  it('shows the shell and the routed page', async () => {
    mount('/plan', new Response(JSON.stringify({ id: 1, email: 'a@example.test', displayName: 'Anna Rossi', isAdmin: false }), { status: 200 }))
    expect(await screen.findByText('plan page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Your menu' })).toBeInTheDocument()
  })

  it('calls every feature useShellStatus hook and shows the summed pendingScans in the banner', async () => {
    mount('/plan', new Response(JSON.stringify({ id: 1, email: 'a@example.test', displayName: 'Anna Rossi', isAdmin: false }), { status: 200 }), {
      statusHooks: [() => ({ pendingScans: 2 }), () => ({}), () => ({ pendingScans: 1 })],
    })
    expect(await findNotice('status', '3 Scans waiting to sync')).toBeInTheDocument()
  })

  it('shows no pending line when no hook reports scans', async () => {
    mount('/plan', new Response(JSON.stringify({ id: 1, email: 'a@example.test', displayName: 'Anna Rossi', isAdmin: false }), { status: 200 }))
    expect(await screen.findByText('plan page')).toBeInTheDocument()
    expect(screen.queryByText(/waiting to sync/)).toBeNull()
  })
})

// R10: offline cold reload. The service worker serves the shell, but /api/me fails: the shell must open from the
// remembered User with the OfflineBanner (useConnectivity is mocked offline above), not stay on "Loading".
describe('AppRoot offline cold reload (R10)', () => {
  const me = { id: 1, email: 'a@example.test', displayName: 'Anna Rossi', isAdmin: false }

  function mountDown(path: string) {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const router = createMemoryRouter(
      [{ path: '/', element: <AppRoot />, children: [{ path: 'plan', element: <p>plan page</p> }, { path: '*', element: <p>other page</p> }] }],
      { initialEntries: [path] },
    )
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => localStorage.clear())

  it('renders the shell, the routed page and the offline banner from the remembered User', async () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me))
    mountDown('/plan')
    expect(await screen.findByText('plan page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Your menu' })).toBeInTheDocument()
    expect(await findNotice('status', 'Offline')).toBeInTheDocument()
    expect(screen.queryByText('Loading')).not.toBeInTheDocument()
  })

  it('with nothing remembered, says it cannot load (an alert), never the sign-in page', async () => {
    mountDown('/plan')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })

  it('a 401 while a User is remembered still goes to sign-in and forgets the User', async () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me))
    mount('/', unauthenticated())
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(localStorage.getItem(ME_CACHE_KEY)).toBeNull()
  })

  it('signing out forgets the remembered User', async () => {
    mount('/plan', new Response(JSON.stringify(me), { status: 200 }))
    // Each call gets its own Response (a body can be read once): /api/me, then the sign-out POST.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(me), { status: 200 })))
    expect(await screen.findByText('plan page')).toBeInTheDocument()
    expect(localStorage.getItem(ME_CACHE_KEY)).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Your menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /sign out/i }))
    await waitFor(() => expect(localStorage.getItem(ME_CACHE_KEY)).toBeNull())
  })
})
