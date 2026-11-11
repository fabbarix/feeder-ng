// Test helper: makes useMediaQuery answer for a viewport width (jsdom has no matchMedia, which means "desktop").
import { vi } from 'vitest'

/** Stubs window.matchMedia so `(min-width: Npx)` matches while width >= N. Pair with vi.unstubAllGlobals(). */
export function stubViewportWidth(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener() {}, removeEventListener() {} }
  })
}
