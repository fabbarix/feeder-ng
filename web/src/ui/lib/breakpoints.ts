// DS-09 (ADR 0027): the one breakpoint table. Widths are in em so a larger browser text size reflows the layout.
// Bands are min-width only; NARROW is the one `width <` band, for the narrowest phones (375 px and below, amendment A1).
// Features call useBreakpoint / useNarrow, never useMediaQuery with a width. CSS uses the same numbers:
// `@media (min-width: 48em)` and `@media (width < 23.5em)`.
import { useSyncExternalStore } from 'react'
import { useMediaQuery } from './useMediaQuery'

/** Min-width bands in em (600, 768, 1024, 1280 and 1440 px at the default 16 px text size). */
export const BREAKPOINTS = { tablet: 37.5, md: 48, desktop: 64, desktopWide: 80, wide: 90 } as const

export type BreakpointName = keyof typeof BREAKPOINTS

/** The narrow band, in em: below 376 px at 16 px text. */
export const NARROW = 23.5

export const NARROW_QUERY = `(width < ${NARROW}em)`

/** The min-width query of a band: `(min-width: 48em)`. */
export function breakpointQuery(name: BreakpointName): string {
  return `(min-width: ${BREAKPOINTS[name]}em)`
}

/** True from the band's width up. Without matchMedia (jsdom, old browsers) it is true: the desktop presentation. */
export function useBreakpoint(name: BreakpointName): boolean {
  return useMediaQuery(breakpointQuery(name))
}

/** True below NARROW. Without matchMedia it is false: the desktop presentation. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(NARROW_QUERY) : null
      if (!mql) return () => {}
      mql.addEventListener?.('change', onChange)
      return () => mql.removeEventListener?.('change', onChange)
    },
    () => (typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(NARROW_QUERY).matches : false),
    () => false,
  )
}
