// Test helper: makes useMediaQuery answer for a viewport width (jsdom has no matchMedia, which means "desktop").
// B9-07 (DS-09): the width queries are in em, so em counts at 16 px (the guard's and the tests' default text size); px still counts.
import { vi } from 'vitest'

const px = (n: string, unit: string) => Number(n) * (unit === 'em' || unit === 'rem' ? 16 : 1)

/** Whether a width query matches `width` px: `(min-width: N)`, `(max-width: N)`, `(width < N)`, `(width >= N)`; N in px, em or rem. Other queries do not match. */
export function widthQueryMatches(query: string, width: number): boolean {
  const conds = [...query.matchAll(/\(\s*(min-width|max-width|width)\s*(:|<=|>=|<|>)?\s*([\d.]+)(px|em|rem)\s*\)/g)]
  if (conds.length === 0) return false
  return conds.every(([, kind, op, n, unit]) => {
    const limit = px(n!, unit!)
    if (kind === 'min-width') return width >= limit
    if (kind === 'max-width') return width <= limit
    return op === '<' ? width < limit : op === '<=' ? width <= limit : op === '>' ? width > limit : width >= limit
  })
}

/** Stubs window.matchMedia so a width query (see widthQueryMatches) answers for `width` px. Pair with vi.unstubAllGlobals(). */
export function stubViewportWidth(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: widthQueryMatches(query, width), media: query, addEventListener() {}, removeEventListener() {} }))
}
