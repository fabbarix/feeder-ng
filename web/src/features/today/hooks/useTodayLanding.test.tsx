// B9-49 (TB-14): Today as a notification's landing. useTodayLanding reads `?step=<scope>:<step>` and `?leftover=<id>` once Today's data is
// ready and then clears them with `replace` (Back never replays a landing):
//   Advance Step due  rings that row for 2 s (RING_MS; `ringed` is its key while it lasts) and tells the screen to focus its Done;
//                     already done (or not there): the notice "That Advance Step is already done."
//   Leftover Use-by   opens that Leftover's action sheet; already answered: "That Leftover is already answered."
// The hook knows nothing of tiles: the screen passes what is true (hasOpenStep, hasOpenLeftover) and what to do (onRingStep, onOpenLeftover,
// onNotice). TodayScreen's wiring is B9-44's (the hook is a plain contract here).
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RING_MS, useTodayLanding, type TodayLandingInput } from './useTodayLanding'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const input = (over: Partial<TodayLandingInput> = {}): TodayLandingInput => ({
  ready: true,
  hasOpenStep: () => true,
  hasOpenLeftover: () => true,
  onRingStep: vi.fn(),
  onOpenLeftover: vi.fn(),
  onNotice: vi.fn(),
  ...over,
})

function mount(search: string, i: TodayLandingInput) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[`/${search}`]}>{children}</MemoryRouter>
  return renderHook(() => ({ landing: useTodayLanding(i), location: useLocation() }), { wrapper })
}

describe('an Advance Step landing', () => {
  it('rings the Step that is still open, once, and clears the parameter (other parameters stay)', () => {
    const i = input()
    const { result } = mount('?x=1&step=meal%3A2026-11-09%2F3%2F5%3A2', i)
    expect(i.onRingStep).toHaveBeenCalledTimes(1)
    expect(i.onRingStep).toHaveBeenCalledWith('meal:2026-11-09/3/5', 2)
    expect(result.current.location.search).toBe('?x=1')
    expect(i.onNotice).not.toHaveBeenCalled()
  })

  it('asks the screen about exactly that Step', () => {
    const hasOpenStep = vi.fn(() => true)
    mount('?step=recipe:4:1', input({ hasOpenStep }))
    expect(hasOpenStep).toHaveBeenCalledWith('recipe:4', 1)
  })

  it('keeps the ring for 2 s: `ringed` names the Step while it lasts, then it is null', () => {
    const { result } = mount('?step=recipe:4:1', input())
    expect(RING_MS).toBe(2000)
    expect(result.current.landing.ringed).toEqual({ scope: 'recipe:4', index: 1 })
    act(() => void vi.advanceTimersByTime(1900))
    expect(result.current.landing.ringed).not.toBeNull()
    act(() => void vi.advanceTimersByTime(200))
    expect(result.current.landing.ringed).toBeNull()
  })

  it('a Step that is already done (or gone) says "That Advance Step is already done." and rings nothing', () => {
    const i = input({ hasOpenStep: () => false })
    const { result } = mount('?step=recipe:4:1', i)
    expect(i.onNotice).toHaveBeenCalledWith('That Advance Step is already done.')
    expect(i.onRingStep).not.toHaveBeenCalled()
    expect(result.current.landing.ringed).toBeNull()
    expect(result.current.location.search).toBe('')
  })
})

describe('a Leftover landing', () => {
  it('opens that Leftover\'s sheet and clears the parameter', () => {
    const i = input()
    const { result } = mount('?leftover=17', i)
    expect(i.onOpenLeftover).toHaveBeenCalledWith(17)
    expect(result.current.location.search).toBe('')
  })

  it('a Leftover that is already answered says "That Leftover is already answered."', () => {
    const i = input({ hasOpenLeftover: () => false })
    mount('?leftover=17', i)
    expect(i.onNotice).toHaveBeenCalledWith('That Leftover is already answered.')
    expect(i.onOpenLeftover).not.toHaveBeenCalled()
  })
})

describe('timing and safety', () => {
  it('waits until Today\'s data is ready: the parameter stays, nothing is judged on an empty screen', () => {
    const i = input({ ready: false })
    const { result, rerender } = mount('?leftover=17&step=recipe:4:1', i)
    expect(i.onNotice).not.toHaveBeenCalled()
    expect(i.onOpenLeftover).not.toHaveBeenCalled()
    expect(result.current.location.search).toBe('?leftover=17&step=recipe:4:1')
    i.ready = true // the data arrived
    rerender()
    expect(i.onOpenLeftover).toHaveBeenCalledWith(17)
    expect(i.onRingStep).toHaveBeenCalledWith('recipe:4', 1)
    expect(result.current.location.search).toBe('')
  })

  it('does nothing without a landing parameter (and never touches the URL)', () => {
    const i = input()
    const { result } = mount('?filter=x', i)
    expect(i.onRingStep).not.toHaveBeenCalled()
    expect(i.onOpenLeftover).not.toHaveBeenCalled()
    expect(i.onNotice).not.toHaveBeenCalled()
    expect(result.current.location.search).toBe('?filter=x')
  })

  it('an unusable value is ignored and cleared, never an error', () => {
    const i = input()
    expect(() => mount('?leftover=abc&step=oops', i)).not.toThrow()
    expect(i.onOpenLeftover).not.toHaveBeenCalled()
    expect(i.onNotice).not.toHaveBeenCalled()
  })
})
