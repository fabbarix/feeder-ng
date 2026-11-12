// CRS G2 (rx-pt.md section 4, spec 7.4.1): the Review Exclusions page, route /plan/couldnt-plan/excluded.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALEX, KIM, SAM, exclusionCell, fishPie, garlic, sideWeek } from '../couldnt-fixtures'
import { mockApi, renderWithProviders } from '../test-utils'
import type { ExclusionCell, PlanView } from '../types'
import { CouldntPlanExclusionsScreen } from './CouldntPlanExclusionsScreen'

afterEach(() => vi.unstubAllGlobals())

const PATH = '/plan/couldnt-plan/excluded'
const THREE = ['2026-11-13', '2026-11-14', '2026-11-15']
const view = (excluded: string[]): PlanView => ({ today: '2026-11-10', horizonDays: 7, updating: false, slots: sideWeek(excluded) })

// Fri and Sun: Sam's garlic. Sat: Kim is away from the Side, so a second explanation.
const fri = exclusionCell('2026-11-13')
const sat = exclusionCell('2026-11-14', { attendance: [SAM, ALEX], optOuts: [KIM], exclusions: [garlic(), fishPie()] })
const sun = exclusionCell('2026-11-15')

function setup(cells: ExclusionCell[], route = PATH, extra: Record<string, unknown> = {}) {
  const api = mockApi({ 'GET /api/plan/couldnt-plan/exclusions': { cells }, 'GET /api/plan': view(THREE), ...extra })
  renderWithProviders(
    <Routes>
      <Route path={PATH} element={<CouldntPlanExclusionsScreen />} />
      <Route path="/plan" element={<p>The Plan page</p>} />
    </Routes>,
    route,
  )
  return api
}

describe('CouldntPlanExclusionsScreen: layout', () => {
  it('is a page titled Review Exclusions, under Plan in the breadcrumbs', async () => {
    setup([fri, sat, sun])
    expect(await screen.findByRole('heading', { level: 1, name: 'Review Exclusions' })).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Plan' })).toHaveAttribute('href', '/plan')
    expect(within(crumbs).getByText('Review Exclusions')).toHaveAttribute('aria-current', 'page')
  })

  it('first the summary Tile with the Excluded headline, then one Tile per explanation', async () => {
    setup([fri, sat, sun])
    const regions = await screen.findAllByRole('region')
    expect(regions).toHaveLength(3)
    expect(regions[0]).toHaveAccessibleName("Couldn't plan 3 Sides. Every Recipe is excluded for someone who eats it.")
    expect(regions[1]).toHaveAccessibleName('Side at Friday and Sunday dinners')
    expect(regions[2]).toHaveAccessibleName('Side at Saturday dinner')
  })

  it('Fri and Sun share a Tile (the same explanation), Sat has its own with the opt-out line and both Exclusions', async () => {
    setup([fri, sat, sun])
    await screen.findAllByRole('region')
    const satTile = screen.getByRole('region', { name: 'Side at Saturday dinner' })
    expect(within(satTile).getByText("Kim opts out of Side, so Kim's Exclusions don't count here.")).toBeInTheDocument()
    expect(within(within(satTile).getByRole('list', { name: 'Exclusions' })).getAllByRole('listitem')).toHaveLength(2)
    const friTile = screen.getByRole('region', { name: 'Side at Friday and Sunday dinners' })
    expect(within(friTile).getByRole('button', { name: 'Show all 2' })).toBeInTheDocument()
  })

  it('links by accessible name: Open the Plan, Review garlic, the Recipe', async () => {
    setup([fri, sat, sun])
    await screen.findAllByRole('region')
    expect(screen.getByRole('link', { name: 'Open the Plan' })).toHaveAttribute('href', '/plan')
    expect(screen.getAllByRole('link', { name: 'Review garlic' })[0]).toHaveAttribute('href', '/ingredients/12#exclusions')
    expect(screen.getByRole('link', { name: 'Fish pie' })).toHaveAttribute('href', '/recipes/3#preference-member-2')
  })

  it('Open the Plan goes to the Plan', async () => {
    setup([fri, sat, sun])
    await userEvent.click(await screen.findByRole('link', { name: 'Open the Plan' }))
    expect(await screen.findByText('The Plan page')).toBeInTheDocument()
  })

  it('nothing on it is the danger colour', async () => {
    setup([fri, sat, sun])
    await screen.findAllByRole('region')
    expect(document.querySelector('[data-status="danger"]')).toBeNull()
  })
})

describe('CouldntPlanExclusionsScreen: the hash from the Couldn\'t plan tile', () => {
  it('opens the Tile that holds the cell and puts focus on its line', async () => {
    setup([fri, sat, sun], `${PATH}#cell-2026-11-15-4-2`)
    const line = await waitFor(() => {
      const el = document.getElementById('cell-2026-11-15-4-2')
      expect(el).not.toBeNull()
      return el!
    })
    expect(line).toHaveTextContent('Sun 15 Nov · Dinner · Side')
    await waitFor(() => expect(line).toHaveFocus())
    expect(within(screen.getByRole('region', { name: 'Side at Friday and Sunday dinners' })).getByRole('button', { name: 'Hide the list' })).toBeInTheDocument()
  })

  it('without a hash every Tile starts collapsed and nothing takes focus', async () => {
    setup([fri, sat, sun])
    await screen.findAllByRole('region')
    expect(screen.getByRole('button', { name: 'Show all 2' })).toHaveAttribute('aria-expanded', 'false')
    expect(document.body).toHaveFocus()
  })
})

describe('CouldntPlanExclusionsScreen: states', () => {
  it('empty: no Course is held back by Exclusions now, with Open the Plan, and no summary Tile', async () => {
    setup([])
    expect(await screen.findByRole('heading', { name: 'No Course is held back by Exclusions now.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the Plan' })).toHaveAttribute('href', '/plan')
    expect(screen.queryByText(/^Couldn't plan/)).not.toBeInTheDocument()
  })

  it('cells that are not filed under Excluded (a Slot Rule cell) do not make the page; with only those it is the empty state', async () => {
    setup([exclusionCell('2026-11-13', { slotRuleClaimed: true })])
    expect(await screen.findByRole('heading', { name: 'No Course is held back by Exclusions now.' })).toBeInTheDocument()
  })

  it('a cell with no detail yet says Feeder is still working it out', async () => {
    setup([exclusionCell('2026-11-13', { exclusions: null })])
    expect(await screen.findByText('Feeder is still working out which Exclusions these are. Check again in a moment.')).toBeInTheDocument()
  })

  it('while loading it says so, and shows no empty state', async () => {
    setup([fri])
    expect(screen.getByText('Loading the Exclusions…')).toBeInTheDocument()
    expect(screen.queryByText('No Course is held back by Exclusions now.')).not.toBeInTheDocument()
    await screen.findAllByRole('region')
  })

  it('a failed request is an error with Try again, never an empty page', async () => {
    let calls = 0
    mockApi({
      'GET /api/plan/couldnt-plan/exclusions': () => (++calls === 1 ? { status: 500, json: { error: { code: 'internal', message: 'boom' } } } : { cells: [fri] }),
      'GET /api/plan': view(THREE),
    })
    renderWithProviders(<CouldntPlanExclusionsScreen />, PATH)
    expect(await screen.findByText('The Exclusions could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByText('No Course is held back by Exclusions now.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByRole('region')).toHaveLength(2)
  })

  it('a plain User sees the same page (preferences are not Admin-only): no "Ask an Admin"', async () => {
    setup([fri], PATH, { 'GET /api/me': { id: 2, email: 'u@example.com', displayName: 'U', isAdmin: false } })
    await screen.findAllByRole('region')
    expect(screen.queryByText(/Ask an Admin/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review garlic' })).toBeInTheDocument()
  })
})
