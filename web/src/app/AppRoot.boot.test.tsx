// B9-49: AppRoot's boot behaviour. RES-08: while /api/me is pending AppRoot returns <BootShell/> (the skeleton, "Opening Feeder"), never a
// bare "Loading". RES-07: it sums the features' status hooks (Scans, Ticks, Sign-in requests) once and hands them to the shell.
// TB-14: it mounts useServiceWorkerNavigate (a navigate message from a notification click moves the router, no reload).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../ui'
import { AppRoot, type AppRootProps } from './AppRoot'
import { ME_CACHE_KEY } from './meCache'

vi.mock('../features/import', async (orig) => ({ ...(await orig<object>()), forgetStoredPhotos: async () => {} }))
vi.mock('./useConnectivity', () => ({ useConnectivity: () => ({ offline: false, lastContact: null }) }))
vi.mock('./ShellTimers', () => ({ ShellTimers: () => null }))
vi.mock('./AppShell', () => ({
  AppShell: (p: { pendingScans?: number; pendingTicks?: number; pendingAccessRequests?: number }) => (
    <main data-testid="shell" data-scans={p.pendingScans} data-ticks={p.pendingTicks} data-requests={p.pendingAccessRequests} />
  ),
}))

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

const ME = { id: 1, email: 'a@example.test', displayName: 'Anna', isAdmin: false }

function mount(me: Promise<Response> | Response, props: AppRootProps = {}, path = '/') {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(me))
  const router = createMemoryRouter([{ path: '/', element: <AppRoot {...props} />, children: [{ path: '*', element: <p>page</p> }] }], { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return router
}

describe('RES-08: a pending /api/me shows the boot shell', () => {
  it('renders the skeleton named "Opening Feeder" from the first frame, and no "Loading" text', () => {
    mount(new Promise(() => {}))
    const status = screen.getAllByRole('status').find((el) => !el.classList.contains('toast-live'))!
    expect(status).toHaveAccessibleName('Opening Feeder')
    expect(status).toHaveClass('boot-shell')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Loading')).toBeNull()
  })

  it('the shell replaces it once the User is known', async () => {
    mount(Promise.resolve(new Response(JSON.stringify(ME), { status: 200 })))
    expect(await screen.findByTestId('shell')).toBeInTheDocument()
    expect(document.querySelector('.boot-shell')).toBeNull()
  })

  it('a remembered User opens the shell at once, with no skeleton frame', () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(ME))
    mount(new Promise(() => {}))
    expect(screen.getByTestId('shell')).toBeInTheDocument()
    expect(document.querySelector('.boot-shell')).toBeNull()
  })
})

describe('RES-07: the queue reaches the shell', () => {
  it('sums Scans, Ticks and Sign-in requests over the features\' hooks', () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(ME))
    mount(new Promise(() => {}), { statusHooks: [() => ({ pendingScans: 2, pendingTicks: 1 }), () => ({ pendingTicks: 2, pendingAccessRequests: 3 }), () => ({})] })
    const shell = screen.getByTestId('shell')
    expect(shell).toHaveAttribute('data-scans', '2')
    expect(shell).toHaveAttribute('data-ticks', '3')
    expect(shell).toHaveAttribute('data-requests', '3')
  })
})

describe('TB-14: a navigate message from the service worker', () => {
  const listeners: Array<(e: MessageEvent) => void> = []
  beforeEach(() => {
    listeners.length = 0
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: {
        addEventListener: (_t: string, l: (e: MessageEvent) => void) => listeners.push(l),
        removeEventListener: (_t: string, l: (e: MessageEvent) => void) => void listeners.splice(listeners.indexOf(l), 1),
      },
    })
  })

  it('moves the router to the url the worker names, once the shell is up', () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(ME))
    const router = mount(new Promise(() => {}))
    expect(listeners).toHaveLength(1)
    act(() => listeners[0]!(new MessageEvent('message', { data: { type: 'navigate', url: '/plan?mark=2026-11-09:3' } })))
    expect(router.state.location.pathname + router.state.location.search).toBe('/plan?mark=2026-11-09:3')
  })
})
