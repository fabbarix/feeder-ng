// B9-40 (SHORT-01): Cook Mode's short-landscape layout is chosen by the same query the CSS uses; without matchMedia it is not short.
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SHORT_LANDSCAPE_QUERY, useShortLandscape } from './useShortLandscape'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stub(matches: boolean, width: number) {
  const listeners = new Set<() => void>()
  let on = matches
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('matchMedia', (q: string) => ({
    // the short-landscape query as a whole, and the table's min-width bands by the window's width
    matches: q === SHORT_LANDSCAPE_QUERY ? on : /^\(min-width: ([\d.]+)em\)$/.test(q) ? width >= Number(/([\d.]+)em/.exec(q)![1]) * 16 : false,
    media: q,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }))
  return (next: boolean) => {
    on = next
    listeners.forEach((l) => l())
  }
}

describe('useShortLandscape', () => {
  it('the query is the one cook.css uses: under 500 px tall and at least 37.5 em wide (the breakpoint table, not the chapter\'s 560 px)', () => {
    expect(SHORT_LANDSCAPE_QUERY).toBe('(max-height: 499px) and (min-width: 37.5em)')
  })
  it('without matchMedia (jsdom, old browsers) it is not short: the portrait presentation', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useShortLandscape())
    expect(result.current).toEqual({ short: false, maxPills: undefined })
  })
  it('a phone on its side at 844 px: short, two whole pills', () => {
    stub(true, 844)
    const { result } = renderHook(() => useShortLandscape())
    expect(result.current).toEqual({ short: true, maxPills: 2 })
  })
  it('at 667 px wide (the smallest landscape): short, one whole pill', () => {
    stub(true, 667)
    const { result } = renderHook(() => useShortLandscape())
    expect(result.current).toEqual({ short: true, maxPills: 1 })
  })
  it('a phone in portrait: not short, no pill limit', () => {
    stub(false, 390)
    const { result } = renderHook(() => useShortLandscape())
    expect(result.current).toEqual({ short: false, maxPills: undefined })
  })
  it('follows a rotation', () => {
    const turn = stub(false, 844)
    const { result } = renderHook(() => useShortLandscape())
    expect(result.current.short).toBe(false)
    act(() => turn(true))
    expect(result.current.short).toBe(true)
  })
})
