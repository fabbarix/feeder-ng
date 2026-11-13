// B5-BOW: the Bought chip in dayChip (only when the row has no other chip) and sheetChips (always, after the state chips).
import { describe, expect, it } from 'vitest'
import { favourite, meal } from '../test-utils'
import type { BoughtInfo } from './bought'
import { dayChip, sheetChips } from './chips'

const ctx = { slotDate: '2026-11-10' }
const bought: BoughtInfo = { ingredients: [{ id: 1, name: 'chicken thighs' }, { id: 2, name: 'cream' }] }

describe('dayChip with a Bought meal', () => {
  it('shows the Bought chip when there is no other chip', () => {
    expect(dayChip(meal({ bought }), ctx)).toMatchObject({ kind: 'why', label: 'Bought' })
  })
  it('leaves the other chip alone: a why chip, Pinned and Cooked win', () => {
    expect(dayChip(meal({ bought, why: [favourite('Anna')] }), ctx)).toMatchObject({ label: "Anna's favourite" })
    expect(dayChip(meal({ bought, pinned: true }), ctx)).toMatchObject({ label: 'Pinned' })
    expect(dayChip(meal({ bought, state: 'cooked' }), ctx)).toMatchObject({ label: 'Cooked' })
  })
  it('a meal not Bought (null, absent, no Ingredients) shows none', () => {
    expect(dayChip(meal({ bought: null }), ctx)).toBeNull()
    expect(dayChip(meal(), ctx)).toBeNull()
    expect(dayChip(meal({ bought: { ingredients: [] } }), ctx)).toBeNull()
  })
})

describe('sheetChips with a Bought meal', () => {
  it('Pinned and Bought show both, Bought after the state chip and before the why chips', () => {
    const { chips, overflow } = sheetChips(meal({ bought, pinned: true, why: [favourite('Anna')] }), ctx)
    expect(chips.map((c) => c.label)).toEqual(['Pinned', 'Bought', "Anna's favourite"])
    expect(overflow).toBe(0)
  })
  it('shows Bought even when a why chip exists', () => {
    expect(sheetChips(meal({ bought, why: [favourite('Anna')] }), ctx).chips.map((c) => c.label)).toEqual(['Bought', "Anna's favourite"])
  })
  it('counts the Bought chip in the overflow', () => {
    const m = meal({ bought, pinned: true, why: [favourite('Anna'), { code: 'perishable_use', ingredient: 'spinach', date: '2026-11-12' }] })
    const { chips, overflow } = sheetChips(m, ctx)
    expect(chips).toHaveLength(3)
    expect(overflow).toBe(1)
  })
  it('nothing extra when not Bought', () => {
    expect(sheetChips(meal({ pinned: true }), ctx).chips.map((c) => c.label)).toEqual(['Pinned'])
  })
})
