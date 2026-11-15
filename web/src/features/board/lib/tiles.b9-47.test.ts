// B9-47 (TB-08): one vocabulary on Today and the board. The Leftover line and the Use soon chip say what Today says.
import { describe, expect, it } from 'vitest'
import type { StockTotalLike } from '../types'
import { course, meal, slotOn } from '../test-utils'
import { leftoverLine, tomorrowLine, useSoonChip, type LeftoverRow } from './tiles'

describe('tomorrowLine: one format (TB-08), "Breakfast: Potato gratin"', () => {
  it('a slot with one Course: "Breakfast: Potato gratin"', () => {
    expect(tomorrowLine(slotOn('2026-11-10', 1, 'Breakfast', '08:30', 'Potato gratin'))).toBe('Breakfast: Potato gratin')
  })
  it('a slot with several Courses: "Dinner: X + Y"', () => {
    const dinner = slotOn('2026-11-10', 3, 'Dinner', '19:00', [course(1, 'Main', true, { meal: meal('Cauliflower al gorgonzola') }), course(2, 'Side', false, { meal: meal('Roasted two-colour cauliflower') })])
    expect(tomorrowLine(dinner)).toBe('Dinner: Cauliflower al gorgonzola + Roasted two-colour cauliflower')
  })
  it('a Not served slot keeps "Dinner · Not served" (ADR 0014)', () => {
    expect(tomorrowLine(slotOn('2026-11-10', 3, 'Dinner', '19:00', null, { notServed: true }))).toBe('Dinner · Not served')
  })
})

describe('leftoverLine: the name over Today\'s meta, "1.25 portions · Use by Tue"', () => {
  const row = (over: Partial<LeftoverRow> = {}): LeftoverRow => ({ id: 1, recipeName: 'Slow cooker beef and barley stew', portions: 1.25, useBy: '2026-11-10', ...over })
  it('a Use-by beyond tomorrow names the short weekday: "Use by Thu"', () => {
    expect(leftoverLine(row({ portions: 2, useBy: '2026-11-12' }), '2026-11-09')).toEqual({ title: 'Slow cooker beef and barley stew', meta: '2 portions · Use by Thu' })
  })
  it('1.25 portions, a Use-by of tomorrow: "1.25 portions · Use by tomorrow"', () => {
    expect(leftoverLine(row(), '2026-11-09').meta).toBe('1.25 portions · Use by tomorrow')
  })
  it('a Use-by of today: "Use by today"; one portion is singular', () => {
    expect(leftoverLine(row({ portions: 1, useBy: '2026-11-09' }), '2026-11-09').meta).toBe('1 portion · Use by today')
  })
  it('the capital U: the board never writes lowercase "use by"', () => {
    expect(leftoverLine(row({ useBy: '2026-11-13' }), '2026-11-09').meta).not.toMatch(/use by/)
  })
  it('a Leftover to answer stays read-only: "Use-by passed" in the meta', () => {
    expect(leftoverLine(row({ toAnswer: true, useBy: '2026-11-08' }), '2026-11-09')).toEqual({ title: 'Slow cooker beef and barley stew', meta: 'Use-by passed' })
  })
})

describe('useSoonChip: "Flour · tomorrow", named "Flour, good until tomorrow"', () => {
  const total = (name: string, nextGoesOff: string | null): StockTotalLike => ({ ingredientId: 1, name, baseUnit: 'g', total: 500, nextGoesOff, useSoon: true, spoiledCount: 0 })
  it('tomorrow', () => {
    expect(useSoonChip(total('Flour', '2026-11-10'), '2026-11-09')).toEqual({ label: 'Flour · tomorrow', name: 'Flour, good until tomorrow' })
  })
  it('today (and a day already gone counts as today, as on Today)', () => {
    expect(useSoonChip(total('Milk', '2026-11-09'), '2026-11-09')).toEqual({ label: 'Milk · today', name: 'Milk, good until today' })
    expect(useSoonChip(total('Milk', '2026-11-08'), '2026-11-09').label).toBe('Milk · today')
  })
  it('later: the short weekday, "Baby spinach · Tue"', () => {
    expect(useSoonChip(total('Baby spinach', '2026-11-17'), '2026-11-09')).toEqual({ label: 'Baby spinach · Tue', name: 'Baby spinach, good until Tue' })
  })
  it('with no go-off date it is just the name', () => {
    expect(useSoonChip(total('Rice', null), '2026-11-09')).toEqual({ label: 'Rice', name: 'Rice' })
  })
})
