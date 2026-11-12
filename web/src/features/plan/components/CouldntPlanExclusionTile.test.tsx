// CRS G2 (rx-pt.md section 4.2): one explanation Tile of the Review Exclusions page. Keyboard and ARIA.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ADA, ALEX, KIM, SAM, WEEK, exclusionCell, fishPie, garlic, sideWeek } from '../couldnt-fixtures'
import { explanationGroups, type ExplanationGroup } from '../lib/couldntExclusions'
import type { ExclusionCell } from '../types'
import { CouldntPlanExclusionTile } from './CouldntPlanExclusionTile'

const slots = sideWeek(WEEK)
const groupOf = (cells: ExclusionCell[]): ExplanationGroup => explanationGroups(cells, slots)[0]!
const cellsOn = (dates: string[], over: Partial<ExclusionCell> = {}) => dates.map((d) => exclusionCell(d, over))

function setup(group: ExplanationGroup, { expanded = false, focusId = null as string | null } = {}) {
  const onToggle = vi.fn()
  const view = render(
    <MemoryRouter>
      <CouldntPlanExclusionTile group={group} expanded={expanded} onToggle={onToggle} focusId={focusId} />
    </MemoryRouter>,
  )
  return { onToggle, view }
}

describe('CouldntPlanExclusionTile', () => {
  const three = groupOf(cellsOn(['2026-11-13', '2026-11-14', '2026-11-15']))

  it('is a section named by the cells it explains', () => {
    setup(three)
    expect(screen.getByRole('region', { name: 'Side at Friday, Saturday and Sunday dinners' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Side at Friday, Saturday and Sunday dinners' })).toBeInTheDocument()
  })

  it('"Who eats it" lists the Members as pills', () => {
    setup(three)
    const who = screen.getByRole('list', { name: 'Who eats it' })
    expect(within(who).getAllByRole('listitem').map((li) => li.querySelector('.member-pill__name')?.textContent)).toEqual(['Sam', 'Alex'])
  })

  it('says who opts out and why their Exclusions are not here; says nothing when nobody does', () => {
    setup(groupOf(cellsOn(['2026-11-13'], { optOuts: [KIM], attendance: [SAM, ALEX] })))
    expect(screen.getByText("Kim opts out of Side, so Kim's Exclusions don't count here.")).toBeInTheDocument()
    setup(three)
    expect(screen.getAllByText(/opts? out of/)).toHaveLength(1)
  })

  it('an Ingredient row: Avatar, "Sam excludes garlic", what it rules out, and a Review garlic link', () => {
    setup(three)
    const list = screen.getByRole('list', { name: 'Exclusions' })
    const row = within(list).getByRole('listitem')
    expect(within(row).getByRole('img', { name: 'Sam' })).toBeInTheDocument()
    expect(row).toHaveTextContent('Sam excludes garlic')
    expect(row).toHaveTextContent('Rules out 4 Recipes: Bolognese, Garlic bread, Pesto pasta and 1 more')
    expect(within(row).getByRole('link', { name: 'Review garlic' })).toHaveAttribute('href', '/ingredients/12#exclusions')
  })

  it('a direct row: each Recipe is a link to that Member\'s row of the Recipe\'s preference table', () => {
    const rec = fishPie(ALEX, { recipes: [{ id: 3, name: 'Fish pie' }, { id: 9, name: 'Lasagne' }, { id: 11, name: 'Paella' }], recipeCount: 3 })
    setup(groupOf(cellsOn(['2026-11-13'], { exclusions: [garlic(), rec] })))
    const rows = within(screen.getByRole('list', { name: 'Exclusions' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveTextContent('Alex excludes 3 Recipes: Fish pie, Lasagne and Paella')
    expect(within(rows[1]!).getByRole('link', { name: 'Lasagne' })).toHaveAttribute('href', '/recipes/9#preference-member-2')
    expect(within(rows[1]!).queryByRole('link', { name: /Review/ })).not.toBeInTheDocument()
  })

  it('"and 2 more Exclusions" ends the list; "and 1 more Exclusion" in the singular', () => {
    setup(groupOf(cellsOn(['2026-11-13'], { moreExclusions: 2 })))
    const rows = within(screen.getByRole('list', { name: 'Exclusions' })).getAllByRole('listitem')
    expect(rows.at(-1)).toHaveTextContent('and 2 more Exclusions')
    setup(groupOf(cellsOn(['2026-11-14'], { moreExclusions: 1 })))
    expect(screen.getByText('and 1 more Exclusion')).toBeInTheDocument()
  })

  it('no detail yet: says Feeder is still working it out, and has no Exclusions list', () => {
    setup(groupOf(cellsOn(['2026-11-13'], { exclusions: null })))
    expect(screen.getByText('Feeder is still working out which Exclusions these are. Check again in a moment.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Exclusions' })).not.toBeInTheDocument()
  })

  it('is warn (amber), not danger, with an icon', () => {
    const { view } = setup(three)
    const tile = view.container.querySelector('section')!
    expect(tile).toHaveAttribute('data-status', 'spoil')
    expect(tile.querySelector('[data-status="danger"]')).toBeNull()
  })
})

describe('CouldntPlanExclusionTile: Show all N', () => {
  const three = groupOf(cellsOn(['2026-11-13', '2026-11-14', '2026-11-15']))

  it('collapsed: the cells are not listed; the button says Show all 3 and is not expanded', () => {
    setup(three)
    expect(screen.getByRole('button', { name: 'Show all 3' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: 'Where this applies' })).not.toBeInTheDocument()
    expect(screen.queryByText('Fri 13 Nov · Dinner · Side')).not.toBeInTheDocument()
  })

  it('expanded: every cell, one line each, with its id; the button says Hide the list', () => {
    setup(three, { expanded: true })
    const items = within(screen.getByRole('list', { name: 'Where this applies' })).getAllByRole('listitem')
    expect(items.map((li) => li.id)).toEqual(['cell-2026-11-13-4-2', 'cell-2026-11-14-4-2', 'cell-2026-11-15-4-2'])
    expect(items[0]).toHaveTextContent('Fri 13 Nov · Dinner · Side')
    expect(screen.getByRole('button', { name: 'Hide the list' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('Enter and Space on the button toggle; Tab reaches it before the links', async () => {
    const { onToggle } = setup(three)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Show all 3' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onToggle).toHaveBeenCalledTimes(2)
    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Review garlic' })).toHaveFocus()
  })

  it('a Tile of one cell always shows its line and has no button (a link from the tile can land on it)', () => {
    setup(groupOf(cellsOn(['2026-11-13'])))
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Where this applies' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('the cell named by `focusId` takes focus, and can: it is a list item with tabindex -1', () => {
    setup(three, { expanded: true, focusId: 'cell-2026-11-14-4-2' })
    const target = document.getElementById('cell-2026-11-14-4-2')!
    expect(target).toHaveAttribute('tabindex', '-1')
    expect(target).toHaveFocus()
  })

  it('a focusId that is not in this Tile moves nothing', () => {
    setup(three, { expanded: true, focusId: 'cell-2026-11-20-4-2' })
    expect(document.body).toHaveFocus()
  })
})

describe('CouldntPlanExclusionTile: a second opt-out wording', () => {
  it('two Members opt out', () => {
    setup(groupOf(cellsOn(['2026-11-13'], { optOuts: [KIM, ADA] })))
    expect(screen.getByText("Kim and Ada opt out of Side, so their Exclusions don't count here.")).toBeInTheDocument()
  })
})
