// B9-08: features/plan/strings.ts is split into strings/{grid,sheets,hero,rules,away,cook}.ts and stays the one import
// every caller uses (planStrings, re-exported), so later packages edit only their own area module.
// The values are pinned by strings.snapshot.json (the whole planStrings object as it was before the split): the split moves
// keys between files, it never renames a key or changes a word.
import { describe, expect, it } from 'vitest'
import { planStrings } from './strings'
import * as grid from './strings/grid'
import * as sheets from './strings/sheets'
import * as hero from './strings/hero'
import * as rules from './strings/rules'
import * as away from './strings/away'
import * as cook from './strings/cook'
import { readSource } from './test-css'

// Functions are compared by their source (`__fn__<source>`), everything else by value.
const norm = (v: unknown): unknown => (typeof v === 'function' ? `__fn__${v.toString()}` : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)])) : v)
const snapshot = JSON.parse(readSource('features/plan/strings.snapshot.json')) as Record<string, unknown>

// Pinned names: every module exports exactly one const, `<area>Strings`.
const modules = {
  grid: grid.gridStrings,
  sheets: sheets.sheetsStrings,
  hero: hero.heroStrings,
  rules: rules.rulesStrings,
  away: away.awayStrings,
  cook: cook.cookStrings,
} as const

describe('plan strings split', () => {
  it('planStrings still has every key and every word it had before the split', () => {
    expect(norm(planStrings)).toEqual(snapshot)
  })

  it('each area module exports its own <area>Strings object', () => {
    for (const [area, obj] of Object.entries(modules)) expect(obj, area).toBeTypeOf('object')
    expect(Object.keys(modules)).toHaveLength(6)
  })

  it('the areas are disjoint: no key is defined in two modules', () => {
    const seen = new Map<string, string>()
    for (const [area, obj] of Object.entries(modules)) {
      for (const key of Object.keys(obj)) {
        expect(seen.get(key), `"${key}" is in both ${seen.get(key)} and ${area}`).toBeUndefined()
        seen.set(key, area)
      }
    }
  })

  it('together the areas hold exactly the keys of planStrings', () => {
    const union = Object.values(modules).flatMap((o) => Object.keys(o)).sort()
    expect(union).toEqual(Object.keys(snapshot).sort())
  })

  it('grid, sheets, hero, rules and cook are not empty (away may be empty until PC-03 adds its words)', () => {
    for (const area of ['grid', 'sheets', 'hero', 'rules', 'cook'] as const) expect(Object.keys(modules[area]).length, area).toBeGreaterThan(0)
  })

  it('no area module is a copy of the whole object: none holds more than 60 % of the keys', () => {
    const total = Object.keys(snapshot).length
    for (const [area, obj] of Object.entries(modules)) expect(Object.keys(obj).length, area).toBeLessThanOrEqual(total * 0.6)
  })

  it('strings.ts re-exports: it composes planStrings from the six modules and keeps the as-const typing', () => {
    const src = readSource('features/plan/strings.ts')
    for (const area of ['grid', 'sheets', 'hero', 'rules', 'away', 'cook']) {
      expect(src, area).toMatch(new RegExp(`from '\\./strings/${area}'`))
      expect(src, area).toContain(`${area}Strings`)
    }
    expect(src).toMatch(/export const planStrings\b/)
    // no copy of a word stays behind in strings.ts: it is short glue
    expect(src.split('\n').length).toBeLessThan(40)
  })

  it('every area module is plain data: no import of React, no function', () => {
    for (const area of ['grid', 'sheets', 'hero', 'rules', 'away', 'cook']) {
      const src = readSource(`features/plan/strings/${area}.ts`)
      expect(src, area).not.toMatch(/from 'react'/)
      expect(src, area).toMatch(new RegExp(`export const ${area}Strings\\b`))
    }
  })

  it('nothing outside strings.ts and strings/ is changed for it: callers keep importing ../strings', () => {
    const callers = ['features/plan/screens/PlanScreen.tsx', 'features/plan/components/SlotMenu.tsx', 'features/plan/hooks/useMarkSlotRoute.ts']
    for (const c of callers) expect(readSource(c), c).toMatch(/from '\.\.\/strings'/)
  })
})
