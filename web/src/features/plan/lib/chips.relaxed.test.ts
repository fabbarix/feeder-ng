// CRS F (ADR 0009, spec 7.5): where the relaxed chip shows. A neutral why chip, never warn or danger.
import { describe, expect, it } from 'vitest'
import { dayChip, heroChips, sheetChips } from './chips'
import { meal } from '../test-utils'
import type { Why } from '../types'

const ctx = { slotDate: '2026-11-10' }
const relaxed: Why = { code: 'cooldown_relaxed', date: '2026-11-08', recipeId: 7 }
const fav: Why = { code: 'favourite', members: ['Anna'] }
const perish: Why = { code: 'perishable_use', ingredient: 'spinach', date: '2026-11-12' }
const stock: Why = { code: 'stock_coverage', ingredient: 'rice' }
const labels = (chips: { label: string }[]) => chips.map((c) => c.label)

describe('the day tile chip', () => {
  it('shows the relaxed chip only when the Planned Meal has nothing else to say', () => {
    expect(dayChip(meal({ relaxed: true, why: [relaxed] }), ctx)?.label).toBe('Again soon: had Sun')
  })

  it('prefers any other why chip, whatever the order the server sent', () => {
    expect(dayChip(meal({ relaxed: true, why: [relaxed, fav] }), ctx)?.label).toBe("Anna's favourite")
  })

  it('a state chip (Pinned, Cooked) and a Leftover chip still come first', () => {
    expect(dayChip(meal({ pinned: true, why: [relaxed] }), ctx)?.label).toBe('Pinned')
  })

  it('is a neutral why chip: no status, so never the warn or danger look', () => {
    const chip = dayChip(meal({ relaxed: true, why: [relaxed] }), ctx)!
    expect(chip.kind).toBe('why')
    expect(chip.status).toBeUndefined()
  })

  it('a stored best_available chip makes no chip at all', () => {
    expect(dayChip(meal({ why: [{ code: 'best_available' }] }), ctx)).toBeNull()
  })
})

describe('the Today hero chips', () => {
  it('put the relaxed chip after the positive why chips', () => {
    expect(labels(heroChips(meal({ why: [relaxed, fav] }), ctx))).toEqual(["Anna's favourite", 'Again soon: had Sun'])
  })

  it('keep at most two, the positive ones first (the relaxed chip drops out when two positive ones fill the row)', () => {
    expect(labels(heroChips(meal({ why: [relaxed, fav, perish] }), ctx))).toEqual(["Anna's favourite", 'uses spinach by Thu'])
  })

  it('a relaxed pick with nothing else shows the relaxed chip alone', () => {
    expect(labels(heroChips(meal({ why: [relaxed] }), ctx))).toEqual(['Again soon: had Sun'])
  })

  it('a variety chip is relaxed too and sorts after the positive ones', () => {
    const variety: Why = { code: 'variety_relaxed', tag: 'fish', value: 3 }
    expect(labels(heroChips(meal({ why: [variety, fav] }), ctx))).toEqual(["Anna's favourite", '3rd fish this week'])
  })
})

describe('the Planned Meal sheet chips', () => {
  it('always show the relaxed chip, even when more than three chips compete: it takes the last visible place', () => {
    const { chips, overflow } = sheetChips(meal({ pinned: true, relaxed: true, why: [fav, perish, stock, relaxed] }), ctx)
    expect(labels(chips)).toEqual(['Pinned', "Anna's favourite", 'Again soon: had Sun'])
    expect(overflow).toBe(2)
  })

  it('with room to spare the relaxed chip simply comes last', () => {
    const { chips, overflow } = sheetChips(meal({ why: [relaxed, fav] }), ctx)
    expect(labels(chips)).toEqual(["Anna's favourite", 'Again soon: had Sun'])
    expect(overflow).toBe(0)
  })
})
