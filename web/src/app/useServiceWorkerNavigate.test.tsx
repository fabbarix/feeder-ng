// B9-49 (TB-14): the worker sends { type: 'navigate', url } to a window that is not chromeless; the page calls the router's navigate(url):
// no reload, nothing lost. Only a same-origin app path is followed (the worker already rejects others; the page does not trust it either),
// and a Cook Mode or board window is never navigated away, whatever it is told.
import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useServiceWorkerNavigate } from './useServiceWorkerNavigate'

type Listener = (e: MessageEvent) => void
let listeners: Listener[] = []
const send = (data: unknown) => act(() => listeners.forEach((l) => l(new MessageEvent('message', { data }))))

function Probe() {
  useServiceWorkerNavigate()
  const l = useLocation()
  return <p data-testid="at">{l.pathname + l.search}</p>
}
const mount = (path: string) => {
  const router = createMemoryRouter([{ path: '*', element: <Probe /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  listeners = []
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: {
      addEventListener: (_t: string, l: Listener) => listeners.push(l),
      removeEventListener: (_t: string, l: Listener) => void (listeners = listeners.filter((x) => x !== l)),
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('useServiceWorkerNavigate', () => {
  it('follows a navigate message: the router goes to the url, with its query (a landing parameter)', () => {
    const router = mount('/plan')
    send({ type: 'navigate', url: '/?leftover=7' })
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toBe('?leftover=7')
  })

  it.each([
    ['another message type', { type: 'something', url: '/plan' }],
    ['no url', { type: 'navigate' }],
    ['an absolute url', { type: 'navigate', url: 'https://evil.example/x' }],
    ['a protocol-relative url', { type: 'navigate', url: '//evil.example/x' }],
    ['a javascript: url', { type: 'navigate', url: 'javascript:alert(1)' }],
    ['not an object', 'navigate'],
  ])('ignores %s', (_name, data) => {
    const router = mount('/plan')
    send(data)
    expect(router.state.location.pathname).toBe('/plan')
  })

  it.each(['/cook/meal/2026-11-09/3', '/board', '/scan/receipt'])('never navigates a window that is on the chromeless screen %s', (path) => {
    const router = mount(path)
    send({ type: 'navigate', url: '/plan' })
    expect(router.state.location.pathname).toBe(path)
  })

  it('registers one listener and removes it on unmount; without a service worker (an insecure origin) it does nothing', () => {
    const router = mount('/plan')
    expect(listeners).toHaveLength(1)
    router.dispose()
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: undefined })
    expect(() => mount('/plan')).not.toThrow()
  })
})
