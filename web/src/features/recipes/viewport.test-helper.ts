// Test helper (B9-10, DS-09): makes useMediaQuery / useBreakpoint answer for a viewport width. The breakpoints are em now
// (`(min-width: 80em)`, `(width < 22.5em)`; 1em = 16 px), the old px queries still answer, so a test says "1280" whatever the code asks.
// ui/lib/viewport.test-helper.ts is B9-07's; this one is the recipes tests' own so they do not wait for it.
import { vi } from 'vitest'

const toPx = (n: string, unit: string) => Number(n) * (unit === 'px' ? 1 : 16)

/** Stubs window.matchMedia: `(min-width: N)` matches while width >= N, `(max-width: N)` and `(width < N)` while width is below. Pair with vi.unstubAllGlobals(). */
export function stubViewportWidth(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /\(min-width:\s*([0-9.]+)(px|em|rem)\)/.exec(query)
    const max = /\(max-width:\s*([0-9.]+)(px|em|rem)\)/.exec(query)
    const lt = /\(width\s*<\s*([0-9.]+)(px|em|rem)\)/.exec(query)
    const matches = min ? width >= toPx(min[1]!, min[2]!) : max ? width <= toPx(max[1]!, max[2]!) : lt ? width < toPx(lt[1]!, lt[2]!) : false
    return { matches, media: query, addEventListener() {}, removeEventListener() {} }
  })
}
