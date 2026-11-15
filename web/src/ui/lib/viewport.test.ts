// B9-19 (SHORT-04, system.md 11.1): the size classes as media-query constants. Heights are px (a zoomed page loses CSS height too);
// widths are in em from the one breakpoint table (DS-09): short landscape starts at the tablet band (37.5 em, 600 px), the compact rail
// gives way to the 88 px rail at 64 em.
import { describe, expect, it } from 'vitest'
import { BREAKPOINTS, breakpointQuery } from './breakpoints'
import {
  COARSE_QUERY,
  COMPACT_RAIL_QUERY,
  SHORT_LANDSCAPE_QUERY,
  SHORT_MAX_HEIGHT,
  SHORT_NARROW_QUERY,
  SHORT_QUERY,
  VERY_SHORT_MAX_HEIGHT,
  VERY_SHORT_QUERY,
} from './viewport'

/** Whether a query made of (max-height: Npx), (min-width: Nem) and (width < Nem) conditions matches a viewport (16 px text). */
function matches(query: string, w: number, h: number): boolean {
  const conds = [...query.matchAll(/\(\s*([a-z-]+)\s*(:|<)\s*([\d.]+)(px|em)\s*\)/g)]
  expect(conds.length, query).toBeGreaterThan(0)
  expect(query.replace(/\([^)]*\)/g, '').replace(/\band\b/g, '').trim(), `${query} has only (…) and (…) parts`).toBe('')
  return conds.every(([, name, op, n, unit]) => {
    const v = Number(n) * (unit === 'em' ? 16 : 1)
    if (name === 'max-height') return h <= v
    if (name === 'min-width') return w >= v
    if (name === 'width' && op === '<') return w < v
    throw new Error(`unexpected condition ${name} in ${query}`)
  })
}

describe('viewport size classes (B9-19, system.md 11.1)', () => {
  it('short is under 500 px tall, very short under 340 px', () => {
    expect([SHORT_MAX_HEIGHT, VERY_SHORT_MAX_HEIGHT]).toEqual([499, 339])
    expect(SHORT_QUERY).toBe('(max-height: 499px)')
    expect(VERY_SHORT_QUERY).toBe('(max-height: 339px)')
    expect(COARSE_QUERY).toBe('(pointer: coarse)')
  })

  it('the widths come from the breakpoint table: short landscape from the tablet band, short narrow below it, the compact rail below the desktop band', () => {
    expect(SHORT_LANDSCAPE_QUERY).toContain(breakpointQuery('tablet'))
    expect(SHORT_NARROW_QUERY).toContain(`(width < ${BREAKPOINTS.tablet}em)`)
    expect(COMPACT_RAIL_QUERY).toContain(breakpointQuery('tablet'))
    expect(COMPACT_RAIL_QUERY).toContain(`(width < ${BREAKPOINTS.desktop}em)`)
    for (const q of [SHORT_QUERY, SHORT_LANDSCAPE_QUERY, SHORT_NARROW_QUERY, COMPACT_RAIL_QUERY]) expect(q).toContain('(max-height: 499px)')
  })

  it.each([
    // [viewport, short, landscape, narrow, compact rail, very short]
    ['375x667 portrait phone', 375, 667, false, false, false, false, false],
    ['667x375 phone held sideways (the smallest landscape)', 667, 375, true, true, false, true, false],
    ['844x390 phone landscape', 844, 390, true, true, false, true, false],
    ['390x450 a short portrait window', 390, 450, true, false, true, false, false],
    ['375x256 at 400 % zoom', 375, 256, true, false, true, false, true],
    ['1024x400 a short desktop window keeps the 88 px rail', 1024, 400, true, true, false, false, false],
    ['1440x900 desktop', 1440, 900, false, false, false, false, false],
    ['600x499 the edge: short landscape from 600 px', 600, 499, true, true, false, true, false],
    ['599x499 just under: short narrow', 599, 499, true, false, true, false, false],
    ['700x500 500 px tall is not short', 700, 500, false, false, false, false, false],
    ['700x339 very short landscape', 700, 339, true, true, false, true, true],
  ] as const)('%s', (_n, w, h, short, landscape, narrow, compact, veryShort) => {
    expect(matches(SHORT_QUERY, w, h)).toBe(short)
    expect(matches(SHORT_LANDSCAPE_QUERY, w, h)).toBe(landscape)
    expect(matches(SHORT_NARROW_QUERY, w, h)).toBe(narrow)
    expect(matches(COMPACT_RAIL_QUERY, w, h)).toBe(compact)
    expect(matches(VERY_SHORT_QUERY, w, h)).toBe(veryShort)
  })
})
