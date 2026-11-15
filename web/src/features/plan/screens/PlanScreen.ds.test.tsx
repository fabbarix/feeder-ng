// ds-plan, updated by B9-32 (PC-11, decision PC 2): the Plan screen is a measured 12-track grid (usePlanGrid) of day tiles; Swap and Pin on the rows.
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanScreen } from './PlanScreen'
import { installResizeObserver } from '../test-utils.grid'
import { courseMeal, courseSlot, favourite, meal, mockApi, planCourse, renderWithProviders, slot } from '../test-utils'
import type { PlanView } from '../types'

afterEach(() => vi.unstubAllGlobals())

const dinner = (date: string) =>
  courseSlot(
    [
      planCourse({ courseId: 1, meal: courseMeal(1, 'Main', { date, recipeName: `Main of ${date}`, why: [favourite('Mia')] }) }),
      planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { date, recipeName: `Side of ${date}`, servedFromLeftover: { leftoverId: 1, date: '2026-11-08', mealSlotId: 2, recipeName: 'x' } }) }),
    ],
    { date, mealSlotId: 2 },
  )
const view: PlanView = { today: '2026-11-09', horizonDays: 3, updating: false, slots: ['2026-11-09', '2026-11-10', '2026-11-11'].map(dinner) }

describe('PlanScreen (design system)', () => {
  it('lays the days out in a measured container (.plan-grid): one column until measured, then the column count of its width', async () => {
    const ro = installResizeObserver()
    mockApi({ 'GET /api/plan': view })
    renderWithProviders(<PlanScreen />)
    const grid = await screen.findByRole('group', { name: 'Plan' })
    expect(grid.parentElement).toHaveClass('plan-grid')
    expect(grid.parentElement).toHaveAttribute('data-columns', '1')
    act(() => ro.fire(1136, grid.parentElement!))
    expect(grid.parentElement).toHaveAttribute('data-columns', '3')
    for (const t of grid.querySelectorAll<HTMLElement>('article')) expect(t.style.gridColumn).toBe('span 4')
  })

  it('no day tile is bigger because of today: it carries only data-today (a 3-day week fills its row, so every day spans 12 ÷ its row)', async () => {
    mockApi({ 'GET /api/plan': view })
    renderWithProviders(<PlanScreen />)
    const grid = await screen.findByRole('group', { name: 'Plan' })
    const tiles = grid.querySelectorAll('article')
    expect(tiles).toHaveLength(3)
    for (const t of tiles) expect(t).not.toHaveAttribute('data-span', '2')
    expect(tiles[0]).toHaveAttribute('data-today', 'true')
    expect(grid.querySelectorAll('[data-today]')).toHaveLength(1)
  })

  it('titles the days "Mon 9 · Today", "Tue 10 · Tomorrow", "Wed 11"', async () => {
    mockApi({ 'GET /api/plan': view })
    renderWithProviders(<PlanScreen />)
    expect(await screen.findByRole('heading', { name: 'Mon 9 · Today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tue 10 · Tomorrow' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Wed 11' })).toBeInTheDocument()
  })

  it('a Course row shows its label, its Recipe, its chips in one line and Swap and Pin at the end', async () => {
    mockApi({ 'GET /api/plan': view })
    renderWithProviders(<PlanScreen />)
    const tile = (await screen.findByRole('heading', { name: 'Tue 10 · Tomorrow' })).closest('article') as HTMLElement
    const rows = tile.querySelectorAll('li.list-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.querySelector('.list-row__meta')).toHaveTextContent('Main')
    expect(within(rows[1] as HTMLElement).getByText('Leftover from Sun')).toBeInTheDocument()
    expect(within(rows[0] as HTMLElement).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Main of 2026-11-10', 'Swap Main of 2026-11-10, Tue 10 Dinner', 'Pin Main of 2026-11-10, Tue 10 Dinner'])
  })

  it('Pin on a row pins that Course (the confirm route), without opening its sheet', async () => {
    const api = mockApi({ 'GET /api/plan': view, 'POST /api/plan/2026-11-10/2/2/confirm': meal({ pinned: true }) })
    renderWithProviders(<PlanScreen />)
    const tile = (await screen.findByRole('heading', { name: 'Tue 10 · Tomorrow' })).closest('article') as HTMLElement
    await userEvent.click(within(tile).getByRole('button', { name: 'Pin Side of 2026-11-10, Tue 10 Dinner' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/2/2/confirm')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it("the Couldn't plan notice sits in a grid sized by min, as one full-width tile", async () => {
    const unplanned = slot({ date: '2026-11-12', mealSlotId: 3, name: 'Lunch', meal: null, unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } })
    mockApi({ 'GET /api/plan': { ...view, slots: [...view.slots, unplanned] } })
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    expect(notice).not.toHaveAttribute('data-columns')
    expect(notice.querySelector('[data-cause]')).toHaveAttribute('data-span', 'full')
  })
})
