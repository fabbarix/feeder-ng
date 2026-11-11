import { describe, expect, it } from 'vitest'
import { favourite, meal } from '../test-utils'
import type { Why } from '../types'
import { dayChip, heroChips, sheetChips } from './chips'

// 2026-11-10 is a Tuesday; 2026-11-09 a Monday.
const ctx = { slotDate: '2026-11-10' }
const leftoverFrom = { leftoverId: 5, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' }

describe('dayChip: at most one chip per Planned Meal on a day tile', () => {
  it('a plain meal with no why says nothing', () => {
    expect(dayChip(meal(), ctx)).toBeNull()
  })

  it('the first phrased why chip', () => {
    const chip = dayChip(meal({ why: [favourite('Anna'), { code: 'stock_coverage', ingredient: 'rice' }] }), ctx)
    expect(chip).toMatchObject({ kind: 'why', label: "Anna's favourite" })
  })

  it('"best available" is noise and never makes a chip', () => {
    expect(dayChip(meal({ why: [{ code: 'best_available' }] }), ctx)).toBeNull()
    expect(dayChip(meal({ why: [{ code: 'best_available' }, favourite('Ben')] }), ctx)).toMatchObject({ label: "Ben's favourite" })
  })

  it('Cooked is a success state chip, Not cooked a danger state chip', () => {
    expect(dayChip(meal({ state: 'cooked', pinned: true, why: [favourite('Anna')] }), ctx)).toMatchObject({ kind: 'state', status: 'success', label: 'Cooked' })
    expect(dayChip(meal({ state: 'skipped' }), ctx)).toMatchObject({ kind: 'state', status: 'danger', label: 'Not cooked' })
  })

  it('a Pinned planned meal shows Pinned before its why chip', () => {
    expect(dayChip(meal({ pinned: true, why: [favourite('Anna')] }), ctx)).toMatchObject({ kind: 'state', status: 'pinned', label: 'Pinned' })
  })

  it('a meal served from a Leftover shows ONE leftover chip "Leftover from Mon", not the duplicate why chip', () => {
    const m = meal({ servedFromLeftover: leftoverFrom, why: [{ code: 'leftover', date: '2026-11-09' }] })
    expect(dayChip(m, ctx)).toMatchObject({ kind: 'status', status: 'leftover', label: 'Leftover from Mon' })
    expect(sheetChips(m, ctx).chips.map((c) => c.label)).toEqual(['Leftover from Mon'])
  })
})

describe('an unnamed stock_coverage chip is noise (the server never sends an Ingredient)', () => {
  const unnamed: Why = { code: 'stock_coverage' }
  const named: Why = { code: 'stock_coverage', ingredient: 'rice' }

  it('dayChip never shows "uses what is in Stock", the next chip wins', () => {
    expect(dayChip(meal({ why: [unnamed] }), ctx)).toBeNull()
    expect(dayChip(meal({ why: [unnamed, favourite('Anna')] }), ctx)).toMatchObject({ label: "Anna's favourite" })
  })

  it('heroChips skips it and still fills the two places from the others', () => {
    const chips = heroChips(meal({ why: [unnamed, favourite('Anna'), named] }), ctx)
    expect(chips.map((c) => c.label)).toEqual(["Anna's favourite", 'uses Stock: rice'])
  })

  it('sheetChips drops it too, so it is nowhere in chips (the copy stays in phraseWhy only)', () => {
    const { chips, overflow } = sheetChips(meal({ why: [unnamed, favourite('Anna')] }), ctx)
    expect(chips.map((c) => c.label)).toEqual(["Anna's favourite"])
    expect(overflow).toBe(0)
    expect(sheetChips(meal({ why: [unnamed] }), ctx)).toEqual({ chips: [], overflow: 0 })
  })

  it('a NAMED stock_coverage still makes a chip', () => {
    expect(dayChip(meal({ why: [named] }), ctx)).toMatchObject({ kind: 'why', label: 'uses Stock: rice' })
  })
})

describe('sheetChips: at most three, the rest as a count', () => {
  const whys: Why[] = [
    favourite('Anna'),
    { code: 'perishable_use', ingredient: 'spinach', date: '2026-11-12' },
    { code: 'ingredient_overlap', ingredient: 'chicken', date: '2026-11-09' },
    { code: 'slot_rule', tag: 'pizza' },
  ]

  it('keeps the first three and counts the rest', () => {
    const { chips, overflow } = sheetChips(meal({ why: whys }), ctx)
    expect(chips.map((c) => c.label)).toEqual(["Anna's favourite", 'uses spinach by Thu', "uses Monday's chicken"])
    expect(overflow).toBe(1)
  })

  it('states come first and count against the three', () => {
    const { chips, overflow } = sheetChips(meal({ pinned: true, why: whys }), ctx)
    expect(chips.map((c) => c.label)).toEqual(['Pinned', "Anna's favourite", 'uses spinach by Thu'])
    expect(overflow).toBe(2)
  })

  it('no duplicate labels and no best available', () => {
    const { chips, overflow } = sheetChips(meal({ why: [favourite('Anna'), favourite('Anna'), { code: 'best_available' }] }), ctx)
    expect(chips.map((c) => c.label)).toEqual(["Anna's favourite"])
    expect(overflow).toBe(0)
  })
})

describe('heroChips: at most two why chips', () => {
  it('the first two, never Pinned or Cooked', () => {
    const chips = heroChips(meal({ pinned: true, why: [favourite('Anna'), { code: 'stock_coverage', ingredient: 'rice' }, { code: 'slot_rule', tag: 'x' }] }), ctx)
    expect(chips.map((c) => c.label)).toEqual(["Anna's favourite", 'uses Stock: rice'])
    expect(chips.every((c) => c.kind === 'why')).toBe(true)
  })
})

// N1: a stored Leftover's served meal can arrive with no source date; never turn "" into a weekday.
describe('the Leftover chip without a source date (N1)', () => {
  const ctx = { slotDate: '2026-11-11' }
  const served = (date: string) => meal({ date: '2026-11-11', servedFromLeftover: { date, mealSlotId: 0, recipeName: 'Pie', leftoverId: 5 } })

  it('says just "Leftover" when the date is empty', () => {
    expect(dayChip(served(''), ctx)?.label).toBe('Leftover')
    expect(sheetChips(served(''), ctx).chips.map((c) => c.label)).toContain('Leftover')
  })

  it('still names the weekday when the date is known', () => {
    expect(dayChip(served('2026-11-10'), ctx)?.label).toBe('Leftover from Tue')
  })
})
