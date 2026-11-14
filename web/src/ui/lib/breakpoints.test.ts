// B9-07 (DS-09, ADR 0027): one breakpoint table, in em, min-width only (plus the one `width <` band for the narrowest phones).
// The module API this file pins is what B9-08, B9-09 and B9-10 import (features call useBreakpoint / useNarrow, never useMediaQuery
// with a width):
//   export const BREAKPOINTS = { tablet: 37.5, md: 48, desktop: 64, desktopWide: 80, wide: 90 } as const   // em
//   export type BreakpointName = keyof typeof BREAKPOINTS
//   export const NARROW = 23.5                       // em: 376 px at the default text size; used as (width < 23.5em)
//   export const NARROW_QUERY = '(width < 23.5em)'
//   export function breakpointQuery(name: BreakpointName): string   // '(min-width: 48em)'
//   export function useBreakpoint(name: BreakpointName): boolean    // true from that width up; true without matchMedia (desktop)
//   export function useNarrow(): boolean                            // true below NARROW; false without matchMedia
// NARROW is 23.5 em, not the chapter's 22.5 em: the user's amendment A1 (2026-11-14) makes 375 px the smallest supported width, and
// the bottom bar shows icons only AT 375 px and below, labels above (decision DS 1, rule R-F). 23.5 em is 376 px at 16 px text.
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BREAKPOINTS, NARROW, NARROW_QUERY, breakpointQuery, useBreakpoint, useNarrow, type BreakpointName } from './breakpoints'
import { stubViewportWidth, widthQueryMatches } from './viewport.test-helper'

afterEach(() => vi.unstubAllGlobals())

describe('the breakpoint table (DS-09)', () => {
  it('has the five min-width bands of the chapter, in em', () => {
    expect(BREAKPOINTS).toEqual({ tablet: 37.5, md: 48, desktop: 64, desktopWide: 80, wide: 90 })
  })

  it('every band equals its old px value at the default 16 px text size (600, 768, 1024, 1280, 1440)', () => {
    expect(Object.values(BREAKPOINTS).map((em) => em * 16)).toEqual([600, 768, 1024, 1280, 1440])
  })

  it('NARROW is 23.5 em (376 px): 375 px, the smallest supported width, is narrow; 390 px is not (amendment A1)', () => {
    expect(NARROW).toBe(23.5)
    expect(NARROW_QUERY).toBe('(width < 23.5em)')
    expect(widthQueryMatches(NARROW_QUERY, 375)).toBe(true)
    expect(widthQueryMatches(NARROW_QUERY, 376)).toBe(false)
    expect(widthQueryMatches(NARROW_QUERY, 390)).toBe(false)
  })

  it('a band is a min-width query in em, one string per name', () => {
    expect(breakpointQuery('tablet')).toBe('(min-width: 37.5em)')
    expect(breakpointQuery('md')).toBe('(min-width: 48em)')
    expect(breakpointQuery('desktop')).toBe('(min-width: 64em)')
    expect(breakpointQuery('desktopWide')).toBe('(min-width: 80em)')
    expect(breakpointQuery('wide')).toBe('(min-width: 90em)')
  })

  it('the handover seam: two 27 rem tiles and a 12 px gap fit the content box at 1024 px (rail 88, gutter 24 each side)', () => {
    // n * min + (n - 1) * gap <= 1024 - 88 - 48 = 888 px: two --tile-min-wide (27 rem = 432 px) tiles and a 12 px gap are 876 px
    expect(2 * 27 * 16 + 12).toBeLessThanOrEqual(1024 - 88 - 2 * 24)
    expect(BREAKPOINTS.desktop * 16).toBe(1024)
  })
})

describe.each(Object.keys(BREAKPOINTS) as BreakpointName[])('useBreakpoint(%s)', (name) => {
  const edge = BREAKPOINTS[name] * 16
  it('asks matchMedia for exactly its em query', () => {
    const asked: string[] = []
    vi.stubGlobal('matchMedia', (q: string) => {
      asked.push(q)
      return { matches: true, media: q, addEventListener() {}, removeEventListener() {} }
    })
    renderHook(() => useBreakpoint(name))
    expect(asked.every((q) => q === breakpointQuery(name))).toBe(true)
    expect(asked.length).toBeGreaterThan(0)
  })
  it(`is false at ${edge - 1} px and true from ${edge} px`, () => {
    stubViewportWidth(edge - 1)
    expect(renderHook(() => useBreakpoint(name)).result.current).toBe(false)
    stubViewportWidth(edge)
    expect(renderHook(() => useBreakpoint(name)).result.current).toBe(true)
  })
  it('is true without matchMedia (jsdom, old browsers): the desktop presentation', () => {
    expect(renderHook(() => useBreakpoint(name)).result.current).toBe(true)
  })
})

describe('useNarrow', () => {
  it('is true at 375 px and below, false at 376 px and above', () => {
    for (const [w, narrow] of [[320, true], [375, true], [376, false], [390, false], [430, false], [1440, false]] as const) {
      stubViewportWidth(w)
      expect(renderHook(() => useNarrow()).result.current, `${w} px`).toBe(narrow)
    }
  })
  it('is false without matchMedia (the desktop presentation, so jsdom renders labels)', () => {
    expect(renderHook(() => useNarrow()).result.current).toBe(false)
  })
})
