import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../ui'
import { AppRoot } from './AppRoot'
import { ME_CACHE_KEY } from './meCache'
import { createQueryClient } from './providers'

// B9-20 (RES-02, RES-06): the app shell is loaded (the service worker answered the page from its cache) and the API fails or
// hangs. A signed-in User must never see a bare "Loading" or a bare "Feeder could not load": the remembered User opens the shell
// at once, and a first launch with no API gets a status that says what is happening, and recovers when the server is back.
vi.mock('./useConnectivity', () => ({ useConnectivity: () => ({ offline: false, savedAt: null }) }))

const me = { id: 1, email: 'a@example.test', displayName: 'Anna', isAdmin: false, householdTimeZone: 'UTC' }
const ok = () => new Response(JSON.stringify(me), { status: 200 })
const down = (status = 503) => new Response('Service Unavailable', { status })
const unauthenticated = () => new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'x' } }), { status: 401 })

/** A fetch whose answer the test chooses; `hang` never answers and rejects like fetch when its signal aborts. */
function server() {
  const state = { answer: (): Response | 'hang' => down(), calls: 0 }
  const fetch = vi.fn((_url: string, init?: RequestInit) => {
    state.calls++
    const a = state.answer()
    if (a !== 'hang') return Promise.resolve(a)
    return new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)))
  })
  vi.stubGlobal('fetch', fetch)
  return state
}

function mount() {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppRoot />, children: [{ path: '*', element: <p>page body</p> }] }],
    { initialEntries: ['/plan'] },
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}
// The ToastProvider's empty alert live region (.toast-live) is always on the page: these look at the page's own alert.
const pageAlerts = () => screen.queryAllByRole('alert').filter((el) => !el.classList.contains('toast-live'))
const pageAlert = () => {
  const all = pageAlerts()
  if (all.length !== 1) throw new Error(`expected one page alert, found ${all.length}`)
  return all[0]!
}
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('first launch (nothing remembered) while the API is down', () => {
  it('a 503 ends in an error state with a real Try again button, not a bare paragraph, within about 1.5 s', async () => {
    server().answer = () => down(503)
    mount()
    await advance(1500)
    const alert = pageAlert()
    expect(alert.closest('.error-state')).not.toBeNull()
    expect(alert).toHaveTextContent('Feeder could not load. Try again in a moment.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('Try again asks the server again and opens the shell when it answers', async () => {
    const s = server()
    s.answer = () => down(503)
    mount()
    await advance(1500)
    s.answer = ok
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    await advance(100)
    expect(screen.getByText('page body')).toBeInTheDocument()
    expect(pageAlerts()).toHaveLength(0)
  })

  it('recovers by itself every 5 s while the error shows: no tap needed when the server comes back', async () => {
    const s = server()
    s.answer = () => down(503)
    mount()
    await advance(1500)
    expect(pageAlert()).toBeInTheDocument()
    s.answer = ok
    await advance(5200)
    expect(screen.getByText('page body')).toBeInTheDocument()
    expect(pageAlerts()).toHaveLength(0)
  })

  it('recovers when the connection returns (the online event) without waiting for the 5 s tick', async () => {
    const s = server()
    s.answer = () => down(503)
    mount()
    await advance(1500)
    s.answer = ok
    act(() => void window.dispatchEvent(new Event('online')))
    await advance(100)
    expect(screen.getByText('page body')).toBeInTheDocument()
  })

  it('an answer that never comes: a polite status from the first frame (not a bare "Loading"), a slow line after 3 s', async () => {
    server().answer = () => 'hang'
    mount()
    const status = screen.getAllByRole('status').find((el) => !el.classList.contains('toast-live'))!
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Still trying to reach Feeder.')).toBeNull()
    await advance(3100)
    expect(screen.getByText('Still trying to reach Feeder.')).toBeInTheDocument()
  })

  it('an answer that never comes ends at the 10 s GET timeout in the same error state with Try again (no second 10 s wait)', async () => {
    const ctl = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(ctl.signal)
    server().answer = () => 'hang'
    mount()
    await advance(3100)
    act(() => ctl.abort(new DOMException('timed out', 'TimeoutError')))
    await advance(100)
    expect(pageAlert().closest('.error-state')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('a 401 is still the sign-in page, not the error state', async () => {
    server().answer = unauthenticated
    mount()
    await advance(100)
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toBeInTheDocument()
  })
})

describe('a remembered User while the API is down or hangs', () => {
  beforeEach(() => localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me)))

  it('the shell opens at once with the remembered User, before /api/me answers', () => {
    server().answer = () => 'hang'
    mount()
    expect(screen.getByText('page body')).toBeInTheDocument()
    expect(pageAlerts()).toHaveLength(0)
  })

  it('a 503 from /api/me keeps the shell: no error page, the screens show their own states', async () => {
    server().answer = () => down(503)
    mount()
    await advance(3000)
    expect(screen.getByText('page body')).toBeInTheDocument()
    expect(screen.queryByText('Feeder could not load. Try again in a moment.')).toBeNull()
  })

  it('a 401 still signs out and forgets the User, whatever was remembered', async () => {
    server().answer = unauthenticated
    mount()
    await advance(100)
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(localStorage.getItem(ME_CACHE_KEY)).toBeNull()
  })
})
