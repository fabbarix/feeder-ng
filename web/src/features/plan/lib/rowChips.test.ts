// ds-plan (docs/design/system.md §2, §6): the chips of one Course row. One kind, one look; the row shows them on one line.
import { describe, expect, it } from 'vitest'
import { meal } from '../test-utils'
import type { Why } from '../types'
import { rowChips } from './rowChips'

const ctx = { slotDate: '2026-11-10' } // a Tuesday
const withWhy = (...why: Why[]) => meal({ why })

describe('rowChips', () => {
  it('"Leftover from Mon" (the meal is served from a Leftover) is the FILLED leftover tone', () => {
    const chips = rowChips(meal({ servedFromLeftover: { date: '2026-11-09' } as never }), ctx)
    expect(chips[0]).toMatchObject({ kind: 'status', status: 'leftover', label: 'Leftover from Mon' })
    expect(chips[0]!.outline).toBeFalsy()
  })

  it('"Leftover for Fri" (leftover_fits) is the OUTLINED leftover tone, not a neutral why chip', () => {
    const chips = rowChips(withWhy({ code: 'leftover_fits', date: '2026-11-13' }), ctx)
    expect(chips).toEqual([expect.objectContaining({ kind: 'status', status: 'leftover', outline: true, label: 'Leftover for Fri' })])
  })

  it('"Leftovers to come" (no date) is outlined leftover too', () => {
    expect(rowChips(withWhy({ code: 'leftover_fits' }), ctx)[0]).toMatchObject({ status: 'leftover', outline: true, label: 'Leftovers to come' })
  })

  it('a favourite is a neutral why chip with the favourite icon (accent-coloured by the chip)', () => {
    const [chip] = rowChips(withWhy({ code: 'favourite', members: ['Mia', 'Fabio'] }), ctx)
    expect(chip).toMatchObject({ kind: 'why', icon: 'favourite', label: 'Mia and Fabio’s favourite' })
    expect(chip!.status).toBeUndefined()
    expect(chip!.outline).toBeFalsy()
  })

  it('a Slot Rule is a neutral why chip with the calendar (slotRule) icon', () => {
    const [chip] = rowChips(withWhy({ code: 'slot_rule' }), ctx)
    expect(chip).toMatchObject({ kind: 'why', icon: 'slotRule', label: 'Slot Rule: Tuesday' })
    expect(chip!.status).toBeUndefined()
  })

  it('every other why chip is neutral and carries an icon (never an accent-soft fill, never a status)', () => {
    const chips = rowChips(withWhy({ code: 'perishable_use', ingredient: 'basil' }, { code: 'ingredient_overlap', date: '2026-11-09', ingredient: 'leek' }), ctx)
    expect(chips.length).toBe(2)
    for (const c of chips) {
      expect(c.kind).toBe('why')
      expect(c.status).toBeUndefined()
      expect(c.icon).toBeTruthy()
    }
  })

  it('shows every chip the meal has, most important first: state, Leftover from, Leftover for, then why (the row clips to one line, the sheet shows all)', () => {
    const chips = rowChips(
      meal({ pinned: true, servedFromLeftover: { date: '2026-11-09' } as never, why: [{ code: 'favourite', members: ['Mia'] }, { code: 'leftover_fits', date: '2026-11-13' }] }),
      ctx,
    )
    expect(chips.map((c) => c.label)).toEqual(['Pinned', 'Leftover from Mon', 'Leftover for Fri', 'Mia’s favourite'])
  })

  it('a Cooked meal says Cooked in the success tone first', () => {
    expect(rowChips(meal({ state: 'cooked' }), ctx)[0]).toMatchObject({ kind: 'state', status: 'success', label: 'Cooked' })
  })

  it('a "Whole meal" chip passed in comes after the leftover chips and before the why chips', () => {
    const whole = { key: 'status:whole-meal', kind: 'status' as const, status: 'info' as const, label: 'Whole meal' }
    const labels = rowChips(withWhy({ code: 'favourite', members: ['Mia'] }), ctx, whole).map((c) => c.label)
    expect(labels).toEqual(['Whole meal', 'Mia’s favourite'])
  })

  it('has no duplicate labels, no chip for best_available, none for a meal with nothing to say', () => {
    expect(rowChips(withWhy({ code: 'best_available' }), ctx)).toEqual([])
    const dup = rowChips(withWhy({ code: 'favourite', members: ['Mia'] }, { code: 'favourite', members: ['Mia'] }), ctx)
    expect(dup).toHaveLength(1)
  })

  it('a relaxed pick keeps its neutral chip last', () => {
    const chips = rowChips(withWhy({ code: 'cooldown_relaxed', date: '2026-11-08' }, { code: 'favourite', members: ['Mia'] }), ctx)
    expect(chips[chips.length - 1]!.label).toBe('Again soon: had Sun')
  })

  it('every chip has a stable unique key', () => {
    const chips = rowChips(meal({ pinned: true, why: [{ code: 'favourite', members: ['Mia'] }, { code: 'slot_rule' }] }), ctx)
    expect(new Set(chips.map((c) => c.key)).size).toBe(chips.length)
  })
})
