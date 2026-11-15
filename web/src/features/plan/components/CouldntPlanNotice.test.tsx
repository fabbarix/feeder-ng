// B9-32 (PC-07): Couldn't plan as ONE compact tile: overline "Couldn't plan", "Show which meals" in its header, and one compact row per cause
// (cause icon, title "7 Desserts", meta "No Recipes are marked as Dessert.", one fix button). It replaces the tile-per-cause design
// (CouldntPlanTile.test / .courses.test, removed with it). TEST-AUTHOR tests.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { EXCLUDED, NO_COURSE_RECIPES, NOBODY, WEEK, dinner, empty, planned } from '../couldnt-fixtures'
import { useCouldntPlanNotice } from '../hooks/useCouldntPlanNotice'
import { courseCells, unplannedOf } from '../lib/couldntGroups'
import type { PlanSlot } from '../types'
import { CouldntPlanNotice } from './CouldntPlanNotice'

function Notice({ slots, isAdmin = true, onFix = vi.fn(), onShowMeals }: { slots: PlanSlot[]; isAdmin?: boolean; onFix?: () => void; onShowMeals?: () => void }) {
  const notice = useCouldntPlanNotice(unplannedOf(courseCells(slots)), courseCells(slots), isAdmin)
  return <CouldntPlanNotice groups={notice.groups} onFix={onFix} onShowMeals={onShowMeals} />
}
const view = (props: Parameters<typeof Notice>[0]) => render(<MemoryRouter><Notice {...props} /></MemoryRouter>)

const desserts = WEEK.map((d) => dinner(d, [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)]))
const both = [...WEEK.map((d, i) => dinner(d, [planned(1, 'Main'), ...(i < 4 ? [empty(2, 'Side', EXCLUDED)] : []), empty(3, 'Dessert', NO_COURSE_RECIPES)]))]

describe('CouldntPlanNotice: one tile', () => {
  it('is ONE section (a region) named "Couldn\'t plan", an info status tile, however many causes there are', () => {
    const { container } = view({ slots: both })
    expect(screen.getAllByRole('region')).toHaveLength(1)
    const tile = screen.getByRole('region', { name: "Couldn't plan" })
    expect(tile).toHaveAttribute('data-variant', 'status')
    expect(tile).toHaveAttribute('data-status', 'info')
    expect(container.querySelector('[data-status="danger"], [data-status="spoil"]')).toBeNull()
    // B9-44 (TB-09, changed on purpose): the title is TileHeader's h2, no longer an overline.
    expect(within(tile).getByRole('heading', { level: 2, name: "Couldn't plan" })).toBeInTheDocument()
  })

  it('renders nothing when everything was planned', () => {
    const { container } = render(<CouldntPlanNotice groups={[]} onFix={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('one compact row per cause, each a group named by its title: "7 Desserts", "4 Sides"', () => {
    view({ slots: both })
    const tile = screen.getByRole('region', { name: "Couldn't plan" })
    expect(within(tile).getAllByRole('group').map((g) => g.getAttribute('aria-label') ?? g.querySelector('.couldnt-cause__title')?.textContent)).toEqual(['7 Desserts', '4 Sides'])
  })

  it('a row has the cause icon, the title, the meta (the cause in one sentence) and one fix button; no hint, no summary, no headline sentence', () => {
    view({ slots: desserts })
    const row = screen.getByRole('group', { name: '7 Desserts' })
    expect(row.querySelector('svg')).not.toBeNull()
    expect(within(row).getByText('7 Desserts')).toBeInTheDocument()
    expect(within(row).getByText('No Recipes are marked as Dessert.')).toBeInTheDocument()
    expect(within(row).getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByText(/The planner fills each Course/)).not.toBeInTheDocument() // the long explanation lives in the sheets
    expect(screen.queryByText(/Dessert at every dinner/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument() // the tile is a section; its causes are rows, not a pile of headings
  })

  it('the fix button says what it acts on ("Mark Recipes as Dessert") and reports its group; it is a secondary button', async () => {
    const onFix = vi.fn()
    view({ slots: desserts, onFix })
    const fix = screen.getByRole('button', { name: 'Mark Recipes as Dessert' })
    expect(fix).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(fix)
    expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ cause: 'no_course_recipes', title: '7 Desserts' }))
  })

  it('a rule conflict row is in the warn tone (its icon; data-tone="warn") and a setup row in info; never danger or spoil', () => {
    view({ slots: both })
    expect(screen.getByRole('group', { name: '7 Desserts' })).toHaveAttribute('data-tone', 'info')
    expect(screen.getByRole('group', { name: '4 Sides' })).toHaveAttribute('data-tone', 'warn')
  })

  it('each row names its cause (data-cause) so a screen can find it', () => {
    view({ slots: both })
    expect(screen.getByRole('group', { name: '4 Sides' })).toHaveAttribute('data-cause', 'excluded')
  })

  it('a plain User gets no fix button for an Admin-only fix, and is told who can change it', () => {
    view({ slots: WEEK.map((d) => dinner(d, [empty(1, 'Main', NOBODY)])), isAdmin: false })
    const row = screen.getByRole('group', { name: '7 Meal Slots' })
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
    expect(within(row).getByText(/Ask an Admin/)).toBeInTheDocument()
  })

  it('nothing in the tile is an alarm: no role=alert, no list of bullet sentences', () => {
    view({ slots: both })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('"Show which meals"', () => {
  it('is a secondary button in the tile header (the TileHeader action), offered once whatever the causes', async () => {
    const onShowMeals = vi.fn()
    view({ slots: both, onShowMeals })
    const tile = screen.getByRole('region', { name: "Couldn't plan" })
    const button = within(tile).getByRole('button', { name: 'Show which meals' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    expect(button.closest('.tile-header__action')).not.toBeNull()
    await userEvent.click(button)
    expect(onShowMeals).toHaveBeenCalledTimes(1)
  })

  it('is left out where nobody gives it a sheet (Today)', () => {
    view({ slots: desserts })
    expect(screen.queryByRole('button', { name: 'Show which meals' })).not.toBeInTheDocument()
  })
})

describe('layout hooks for the page-layout guard', () => {
  it('the tile and its rows carry classes the CSS and the guard use: .plan-couldnt, .couldnt-cause (fix button wraps under the text below 22 rem)', () => {
    view({ slots: both })
    const tile = screen.getByRole('region', { name: "Couldn't plan" })
    expect(tile).toHaveClass('plan-couldnt')
    expect(tile.querySelectorAll('.couldnt-cause')).toHaveLength(2)
  })
})
