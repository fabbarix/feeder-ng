import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoot, type AppRootProps } from './AppRoot'

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

  it('shows the not-invited page after Google refuses the Google sign-in', async () => {
    mount('/not-invited', unauthenticated())
    expect(await screen.findByRole('heading', { name: 'Not invited' })).toBeInTheDocument()
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
    expect(await screen.findByRole('status')).toHaveTextContent('3 Scans waiting to sync')
  })

  it('shows no pending line when no hook reports scans', async () => {
    mount('/plan', new Response(JSON.stringify({ id: 1, email: 'a@example.test', displayName: 'Anna Rossi', isAdmin: false }), { status: 200 }))
    expect(await screen.findByRole('status')).not.toHaveTextContent(/waiting to sync/)
  })
})
