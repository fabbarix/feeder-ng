// R2-2 (L-05): PlanScreen takes its columns from the grid's container, not from matchMedia.
import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanScreen } from './PlanScreen'
import { meal, mockApi, renderWithProviders, slot } from '../test-utils'
import type { PlanView } from '../types'

afterEach(() => vi.unstubAllGlobals())

const view: PlanView = {
  today: '2026-11-09', horizonDays: 7, updating: false,
  slots: ['09', '10', '11'].map((d, i) => slot({ date: `2026-11-${d}`, mealSlotId: 2, meal: meal({ date: `2026-11-${d}`, mealSlotId: 2, recipeId: i + 1, recipeName: `Recipe ${i}` }) })),
}

type Callback = (entries: Array<{ contentRect: { width: number }; target: Element }>) => void
function observe(width: number) {
  const callbacks: Callback[] = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb: Callback) { callbacks.push(cb) }
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  // A desktop viewport (1440 px): the old viewport rule would say seven columns.
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? 1440 >= Number(min[1]) : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
  })
  return () => act(() => { for (const cb of callbacks) cb([{ contentRect: { width }, target: document.body }]) })
}

describe('PlanScreen columns come from the grid container', () => {
  it('a 900 px container on a 1440 px viewport has four columns and full day names', async () => {
    mockApi({ 'GET /api/plan': view })
    const measure = observe(900)
    renderWithProviders(<PlanScreen />)
    const grid = await screen.findByRole('group', { name: 'Plan' })
    measure()
    expect(grid).toHaveAttribute('data-columns', '4')
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })

  it('a 1136 px container (1440 px viewport beside the rail) has seven columns: the week in one row', async () => {
    mockApi({ 'GET /api/plan': view })
    const measure = observe(1136)
    renderWithProviders(<PlanScreen />)
    const grid = await screen.findByRole('group', { name: 'Plan' })
    measure()
    expect(grid).toHaveAttribute('data-columns', '7')
  })

  it('a 1480 px container has seven columns with the short weekday as heading', async () => {
    mockApi({ 'GET /api/plan': view })
    const measure = observe(1480)
    renderWithProviders(<PlanScreen />)
    const grid = await screen.findByRole('group', { name: 'Plan' })
    measure()
    expect(grid).toHaveAttribute('data-columns', '7')
  })

  // Couldn't plan matches Today: at seven columns its tile takes the full width (no half-empty row); at four it stays 2 wide.
  const withUnplanned: PlanView = {
    ...view,
    slots: [
      ...view.slots,
      slot({ date: '2026-11-12', mealSlotId: 3, name: 'Lunch', meal: null, unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } }),
    ],
  }
  it.each([
    [1136, 'full'],
    [900, '2'],
  ])("at a %ipx container the Couldn't plan tile has span %s", async (width, span) => {
    mockApi({ 'GET /api/plan': withUnplanned })
    const measure = observe(width)
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    measure()
    expect(notice.querySelector('[data-cause]')).toHaveAttribute('data-span', span)
  })
})
