import { describe, expect, it } from 'vitest'
import { meal, slot } from '../test-utils'
import { heroSelection } from './hero'

// R12: a meal of today served from a Leftover offers Reheat (not Cook); a later one keeps the chip only.
describe('heroSelection: Reheat (R12)', () => {
  const today = '2026-11-10'
  const noon = new Date('2026-11-10T13:00:00Z')
  const source = { leftoverId: 4, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' }
  const served = (date: string, id = 2) =>
    slot({ date, mealSlotId: id, at: `${date}T19:00:00Z`, meal: meal({ date, mealSlotId: id, servedFromLeftover: source }) })

  it('offers reheat for today\'s meal served from a Leftover', () => {
    const sel = heroSelection([served('2026-11-10')], noon, today)
    expect(sel?.day).toBe('today')
    expect(sel?.action).toBe('reheat')
  })

  it('offers reheat after the slot time too (the hero then also asks Yes, Cooked)', () => {
    const late = new Date('2026-11-10T21:00:00Z')
    expect(heroSelection([served('2026-11-10')], late, today)?.action).toBe('reheat')
  })

  it('tomorrow\'s Leftover meal stays chip only (it cannot be eaten yet)', () => {
    const sel = heroSelection([served('2026-11-11')], noon, today)
    expect(sel?.day).toBe('tomorrow')
    expect(sel?.action).toBe('leftover')
  })

  it('a fresh meal of today still offers cook', () => {
    const fresh = slot({ date: today, at: '2026-11-10T19:00:00Z', meal: meal({ date: today }) })
    expect(heroSelection([fresh], noon, today)?.action).toBe('cook')
  })
})
