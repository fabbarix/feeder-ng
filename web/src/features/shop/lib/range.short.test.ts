import { describe, expect, it } from 'vitest'
import { rangeOptions, shortRangeLabel } from './range'

// b8-shop: below 420 px the "Shop for" chip keeps its icon and shows a shorter value (docs/dev/design/b8-shop.md 1).
describe('shortRangeLabel', () => {
  it('drops "Until": Today, Tomorrow, or the weekday and day of month', () => {
    expect(shortRangeLabel('2026-11-09', '2026-11-09')).toBe('Today')
    expect(shortRangeLabel('2026-11-10', '2026-11-09')).toBe('Tomorrow')
    expect(shortRangeLabel('2026-11-20', '2026-11-09')).toBe('Fri 20')
  })

  it('is never an abbreviation with a full stop or an ellipsis', () => {
    for (const o of rangeOptions('2026-11-09', '2026-11-22')) expect(o.short).not.toMatch(/\.|…/)
  })
})

describe('rangeOptions: short', () => {
  it('every option keeps its full label and carries its short one', () => {
    const o = rangeOptions('2026-11-09', '2026-11-12')
    expect(o.map((x) => x.label)).toEqual(['Today', 'Until tomorrow', 'Until Wed 11', 'Until Thu 12'])
    expect(o.map((x) => x.short)).toEqual(['Today', 'Tomorrow', 'Wed 11', 'Thu 12'])
  })
})
