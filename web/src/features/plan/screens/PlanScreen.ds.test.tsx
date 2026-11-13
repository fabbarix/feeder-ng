// ds-plan (option B): the Plan screen is a BentoGrid min="day" of equal day tiles; no column measuring; Swap and Pin on the rows.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanScreen } from './PlanScreen'
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
  it('lays the days out by BentoGrid min="day": no data-columns, no ResizeObserver needed', async () => {
    vi.stubGlobal('ResizeObserver', class { constructor() { throw new Error('the Plan no longer measures its container') } })
    mockApi({ 'GET /api/plan': view })
    renderWithProviders(<PlanScreen />)
    const grid = await screen.findByRole('group', { name: 'Plan' })
    expect(grid).toHaveAttribute('data-min', 'day')
    expect(grid).not.toHaveAttribute('data-columns')
  })

  it('every day tile is the same width: none spans 2, today carries only data-today', async () => {
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
    expect(within(rows[0] as HTMLElement).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Main of 2026-11-10', 'Swap', 'Pin'])
  })

  it('Pin on a row pins that Course (the confirm route), without opening its sheet', async () => {
    const api = mockApi({ 'GET /api/plan': view, 'POST /api/plan/2026-11-10/2/2/confirm': meal({ pinned: true }) })
    renderWithProviders(<PlanScreen />)
    const tile = (await screen.findByRole('heading', { name: 'Tue 10 · Tomorrow' })).closest('article') as HTMLElement
    await userEvent.click(within(tile).getAllByRole('button', { name: 'Pin' })[1]!)
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
