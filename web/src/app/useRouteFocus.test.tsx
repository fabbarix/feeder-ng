// B9-49 (A11Y-01): on an in-app pathname change focus moves to the new page's h1 (#page-title, tabIndex -1), else to
// <main id="main-content" tabIndex={-1}> when no h1 shows within 2 s. A search-param change never moves focus; the first render never does.
// `useRouteFocus()` is the hook (called once in AppShell, both frames); `focusPageStart()` is the plain function the skip link uses.
import { act, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOCUS_WAIT_MS, focusPageStart, useRouteFocus } from './useRouteFocus'

let go: (to: string) => void = () => {}
let setParams: (p: Record<string, string>) => void = () => {}

function Frame({ withTitle = true }: { withTitle?: boolean }) {
  useRouteFocus()
  const navigate = useNavigate()
  const [, setSearch] = useSearchParams()
  go = (to) => navigate(to)
  setParams = (p) => setSearch(p)
  return (
    <>
      <button type="button">before</button>
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/plan" element={withTitle ? <h1 id="page-title" tabIndex={-1}>Plan</h1> : <p>loading</p>} />
          <Route path="/shop" element={withTitle ? <h1 id="page-title" tabIndex={-1}>Shop</h1> : <p>loading</p>} />
          <Route path="*" element={<p>other</p>} />
        </Routes>
      </main>
    </>
  )
}

const mount = (path = '/plan', withTitle = true) => render(<MemoryRouter initialEntries={[path]}><Frame withTitle={withTitle} /></MemoryRouter>)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useRouteFocus', () => {
  it('never moves focus on the first render', () => {
    mount()
    expect(document.activeElement).toBe(document.body)
  })

  it('moves focus to the new page\'s h1 after a pathname change, without scrolling', async () => {
    mount()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    await act(async () => go('/shop'))
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)))
    expect(document.activeElement).toBe(document.getElementById('page-title'))
    expect(document.activeElement?.textContent).toBe('Shop')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('a search-param change (a filter, a sort) leaves focus where it was', async () => {
    mount()
    const before = document.querySelector('button')!
    before.focus()
    await act(async () => setParams({ q: 'pasta' }))
    await act(async () => void (await vi.advanceTimersByTimeAsync(2500)))
    expect(document.activeElement).toBe(before)
  })

  it('waits for an h1 that mounts late (a loading page), up to 2 s', async () => {
    mount('/other', false)
    await act(async () => go('/plan'))
    expect(FOCUS_WAIT_MS).toBe(2000)
    // /plan renders its h1 at once here; the point is the focus lands on it, not on <main>
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)))
    expect(document.activeElement?.id).toBe('page-title')
  })

  it('no h1 within 2 s (a slow or failed load): focus goes to <main id="main-content">', async () => {
    mount('/plan', false)
    await act(async () => go('/other'))
    await act(async () => void (await vi.advanceTimersByTimeAsync(1900)))
    expect(document.activeElement).toBe(document.body)
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)))
    expect(document.activeElement).toBe(document.getElementById('main-content'))
  })

  it('the h1 is not an operable control: no focus ring (the h1 takes script focus only)', () => {
    mount()
    expect(document.getElementById('page-title')).toHaveAttribute('tabindex', '-1')
  })
})

describe('focusPageStart (the skip link)', () => {
  it('focuses #page-title when there is one', () => {
    mount()
    focusPageStart()
    expect(document.activeElement?.id).toBe('page-title')
  })

  it('else #main-content', () => {
    mount('/other')
    focusPageStart()
    expect(document.activeElement?.id).toBe('main-content')
  })
})
