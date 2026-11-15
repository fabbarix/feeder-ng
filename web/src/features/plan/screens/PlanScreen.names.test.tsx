// B9-32 (A11Y-08, P38): no two buttons of a rendered week share a name, except row targets, which describe themselves by their day.
// Slot header actions and slot menus name their day and Meal Slot too. TEST-AUTHOR tests.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, mockApi, planCourse, renderWithProviders } from '../test-utils'
import type { PlanView } from '../types'
import { PlanScreen } from './PlanScreen'

vi.mock('../../../lib/sse', () => ({ connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }) }))
afterEach(() => vi.unstubAllGlobals())

// The same Recipes on three days, a Breakfast and a Dinner each: the worst case for "Swap, Pin, Swap, Pin".
const day = (date: string) => [
  courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main', { date, mealSlotId: 1, recipeName: 'Pancakes' }) })], { date, mealSlotId: 1, name: 'Breakfast', time: '08:00', at: `${date}T08:00:00Z` }),
  courseSlot(
    [
      planCourse({ courseId: 1, meal: courseMeal(1, 'Main', { date, mealSlotId: 3, recipeName: 'Roast chicken' }) }),
      planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { date, mealSlotId: 3, recipeName: 'Green beans', pinned: date === '2026-11-17' }) }),
      planCourse({ courseId: 3, name: 'Dessert', main: false, meal: null, unfilled: { reason: 'no_course_recipes', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } as never }),
    ],
    { date, mealSlotId: 3, name: 'Dinner', time: '19:00', at: `${date}T19:00:00Z` },
  ),
]
const view: PlanView = { today: '2026-11-16', horizonDays: 3, updating: false, slots: ['2026-11-16', '2026-11-17', '2026-11-18'].flatMap(day) }

const mainEl = () => document.querySelector('main') ?? document.body
const buttons = () => [...mainEl().querySelectorAll<HTMLElement>('button, [role="button"]')].filter((b) => !b.closest('.toast-live, [hidden]'))
const nameOf = (b: HTMLElement) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? ''

describe('PlanScreen: unique names (A11Y-08)', () => {
  it('no two visible buttons in main share a name unless both are row targets that read differently', async () => {
    mockApi({ 'GET /api/plan': view })
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('heading', { name: /^Wed 18/ })
    const byName = new Map<string, HTMLElement[]>()
    for (const b of buttons()) byName.set(nameOf(b), [...(byName.get(nameOf(b)) ?? []), b])
    const dupes = [...byName].filter(([, list]) => list.length > 1)
    for (const [name, list] of dupes) {
      expect(list.every((b) => b.classList.contains('list-row__target')), `"${name}" is not a row target but occurs ${list.length} times`).toBe(true)
      const descriptions = list.map((b) => (b.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' '))
      expect(new Set(descriptions).size, `"${name}": the targets read the same: ${descriptions.join(' | ')}`).toBe(list.length)
    }
  })

  it('Swap, Pin, Cook and the slot menu all name their day and Meal Slot; Today is "Mon 16", never "Today"', async () => {
    mockApi({ 'GET /api/plan': view })
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('heading', { name: /^Wed 18/ })
    const names = buttons().map(nameOf)
    expect(names).toContain('Swap Pancakes, Tue 17 Breakfast')
    expect(names).toContain('Pin Roast chicken, Wed 18 Dinner')
    expect(names).toContain('Pin Green beans, Tue 17 Dinner')
    expect(names).toContain('Choose a Recipe for Dessert, Mon 16 Dinner')
    expect(names).toContain('Cook Mon 16 Breakfast')
    expect(names).toContain('More for Wed 18 Dinner')
    expect(names.filter((n) => /Today/.test(n))).toEqual([])
  })

  it('a Pinned Course shows the same Pin button, pressed (no Unpin button)', async () => {
    mockApi({ 'GET /api/plan': view })
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('heading', { name: /^Wed 18/ })
    const tue = (await screen.findByRole('heading', { name: /^Tue 17/ })).closest('article') as HTMLElement
    expect(within(tue).getByRole('button', { name: 'Pin Green beans, Tue 17 Dinner' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(tue).queryByRole('button', { name: /^Unpin/ })).toBeNull()
  })

  it('keyboard: Enter on Pin keeps focus on that same Pin button while the plan updates', async () => {
    mockApi({ 'GET /api/plan': view, 'POST /api/plan/2026-11-18/3/1/confirm': { ...courseMeal(1, 'Main', { date: '2026-11-18', mealSlotId: 3, recipeName: 'Roast chicken', pinned: true }), changes: [] } })
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('heading', { name: /^Wed 18/ })
    const pin = screen.getByRole('button', { name: 'Pin Roast chicken, Wed 18 Dinner' })
    pin.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('button', { name: 'Pin Roast chicken, Wed 18 Dinner' })
    expect(document.activeElement).toBe(pin)
  })
})
