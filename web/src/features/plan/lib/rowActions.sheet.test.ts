// B9-38 (PC-09, SHORT-02): sheetActions, the pure model of the Planned Meal sheet's footer. At most a primary and a secondary button,
// the rest under the footer's ⋮ "More for <Sun Dinner>". 2026-11-10 is "today".
import { describe, expect, it } from 'vitest'
import { meal } from '../test-utils'
import type { MealResolution } from '../types'
import { sheetActions, type SheetActionSet } from './rowActions'

const today = '2026-11-10'
const on = (date: string, over: Parameters<typeof meal>[0] = {}, offline = false) => sheetActions(meal({ date, ...over }), { date, today, offline })
const ids = (s: SheetActionSet) => ({ primary: s.primary?.id ?? null, secondary: s.secondary?.id ?? null, more: s.more.map((a) => a.id) })
const resolution = (over: Partial<MealResolution> = {}): MealResolution => ({ kind: 'cooked', markedOn: today, markedAt: '2026-11-10T12:40:00Z', markedBy: 'Anna', leftoverPortions: 1.25, canUndo: true, ...over })

describe('sheetActions: a planned meal', () => {
  it("today's meal: Cook (primary), Mark as Cooked (secondary), and Swap, Pin, Choose a Recipe, Not cooked under ⋮", () => {
    expect(ids(on(today))).toEqual({ primary: 'cook', secondary: 'markCooked', more: ['swap', 'pin', 'choose', 'notCooked'] })
  })

  it('a Pinned meal offers Unpin where the other offers Pin', () => {
    expect(ids(on(today, { pinned: true })).more).toEqual(['swap', 'unpin', 'choose', 'notCooked'])
  })

  it('a meal served from a Leftover has Reheat as its primary', () => {
    const s = on(today, { servedFromLeftover: { leftoverId: 4, date: '2026-11-08', mealSlotId: 2, recipeName: 'Chicken curry' } })
    expect(ids(s)).toEqual({ primary: 'reheat', secondary: 'markCooked', more: ['swap', 'pin', 'choose', 'notCooked'] })
  })

  it('a future meal: Cook and Swap; Mark as Cooked moves under ⋮, disabled, "from Mon 16"; no Not cooked (PC 4)', () => {
    const s = on('2026-11-16')
    expect(ids(s)).toEqual({ primary: 'cook', secondary: 'swap', more: ['markCooked', 'pin', 'choose'] })
    expect(s.more[0]).toMatchObject({ id: 'markCooked', disabled: true, note: 'from Mon 16' })
    expect(s.more.slice(1).every((a) => !a.disabled)).toBe(true)
  })

  it('a past meal still waiting: Mark as Cooked is the primary, no Cook (Cook Mode is not for a past date)', () => {
    expect(ids(on('2026-11-08'))).toEqual({ primary: 'markCooked', secondary: 'swap', more: ['pin', 'choose', 'notCooked'] })
  })

  it('has at most two buttons in every state', () => {
    const states = [on(today), on('2026-11-16'), on('2026-11-08'), on(today, { pinned: true })]
    for (const s of states) expect([s.primary, s.secondary].filter(Boolean).length).toBeLessThanOrEqual(2)
  })
})

describe('sheetActions: a Cooked or Not cooked meal (SAFE-03)', () => {
  it('a Cooked meal that can be undone: only the secondary Undo Cooked', () => {
    expect(ids(on(today, { state: 'cooked', resolution: resolution() }))).toEqual({ primary: null, secondary: 'undoCooked', more: [] })
  })

  it('a Not cooked meal: Cooked after all (primary) and Undo Not cooked (secondary)', () => {
    expect(ids(on(today, { state: 'skipped', resolution: resolution({ kind: 'not_cooked', leftoverPortions: 0 }) }))).toEqual({ primary: 'cookedAfterAll', secondary: 'undoNotCooked', more: [] })
  })

  it('no action once it cannot be undone, none offline, none for a meal without a resolution (an older server)', () => {
    expect(ids(on(today, { state: 'cooked', resolution: resolution({ canUndo: false, cannotUndo: 'leftover_used' }) }))).toEqual({ primary: null, secondary: null, more: [] })
    expect(ids(on(today, { state: 'cooked', resolution: resolution() }, true))).toEqual({ primary: null, secondary: null, more: [] })
    expect(ids(on(today, { state: 'cooked' }))).toEqual({ primary: null, secondary: null, more: [] })
  })
})
