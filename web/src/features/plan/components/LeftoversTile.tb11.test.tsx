// B9-44 (TB-09, TB-11; the P39 follow-up of w3d): Leftovers on Today: a status tile in the Leftover tone with a TileHeader (a leftover badge, the
// title "Leftovers", a count, the link "Pantry ›" to /pantry?leftovers=1); its rows are ListRows inside a ul; pressing anywhere on a row opens the
// Leftover's action sheet (flow.openDetails); there is no ⋮ and no tile-wide stretch to the Plan (which also removes the ⋮ ring that touched the tile).
// The overline "LEFTOVERS" and the title "Leftovers to use" are dropped. A question keeps its inline answers.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { LeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import type { Leftover } from '../types'
import { LeftoversTile } from './LeftoversTile'

const l = (id: number, recipeName: string, portions: number, useBy: string, over: Partial<Leftover> = {}): Leftover =>
  ({ id, recipeId: id, recipeName, portions, cookedOn: '2026-11-08', useBy, fromDate: '2026-11-08', fromMealSlotId: 2, ...over }) as Leftover
const TODAY = '2026-11-09'
const list = [l(1, 'Chicken', 2, '2026-11-09'), l(2, 'Slow cooker beef and barley stew', 1.25, '2026-11-10')]
const flowOf = () => ({ busy: false, openSheet: vi.fn(), openDetails: vi.fn(), closeDetails: vi.fn(), answer: vi.fn() }) as unknown as LeftoverFlow & Record<string, ReturnType<typeof vi.fn>>
const view = (leftovers = list, flow: LeftoverFlow | undefined = flowOf()) =>
  render(
    <MemoryRouter>
      <LeftoversTile leftovers={leftovers} today={TODAY} flow={flow} />
    </MemoryRouter>,
  )

describe('LeftoversTile: the header (TB-09)', () => {
  it('has one TileHeader: a leftover badge, the h2 "Leftovers" naming the section, a count', () => {
    const { container } = view()
    expect(container.querySelectorAll('.tile-header')).toHaveLength(1)
    expect(container.querySelector('.tile-header__badge')).toHaveAttribute('data-tone', 'leftover')
    expect(container.querySelector('.tile-header .chip[data-kind="count"]')).toHaveTextContent('2')
    const section = screen.getByRole('region', { name: 'Leftovers' })
    expect(section).toHaveAttribute('aria-labelledby', within(section).getByRole('heading', { level: 2, name: 'Leftovers' }).id)
    expect(screen.queryByText('Leftovers to use')).toBeNull()
    expect(container.querySelector('.tile__overline')).toBeNull()
  })

  it('the trailing link "Pantry ›" goes to /pantry?leftovers=1, named "Pantry, Leftovers"', () => {
    view()
    expect(screen.getByRole('link', { name: 'Pantry, Leftovers' })).toHaveAttribute('href', '/pantry?leftovers=1')
  })

  it('is a status tile in the Leftover tone', () => {
    const { container } = view()
    expect(container.querySelector('[data-variant="status"][data-status="leftover"]')).not.toBeNull()
  })

  it('has no tile-wide target to the Plan any more', () => {
    const { container } = view()
    expect(container.querySelector('.tile__stretch, [data-stretched]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Leftovers to use' })).toBeNull()
  })

  it('renders nothing without Leftovers', () => {
    const { container } = view([])
    expect(container).toBeEmptyDOMElement()
  })
})

describe('LeftoversTile: the rows (TB-11)', () => {
  it('are li.list-row inside a real ul (never a li directly in the tile)', () => {
    const { container } = view()
    const rows = container.querySelectorAll('li.list-row')
    expect(rows).toHaveLength(2)
    for (const r of rows) expect(r.parentElement?.tagName).toBe('UL')
  })

  it('show "Use by today · 2 portions" in the meta order of DS 5', () => {
    view()
    expect(screen.getByText('Use by today · 2 portions')).toBeInTheDocument()
  })

  it('pressing a row opens the Leftover’s action sheet; the row is named with its portions, Use-by and the three answers', async () => {
    const flow = flowOf()
    view(list, flow)
    const row = screen.getByRole('button', { name: 'Slow cooker beef and barley stew, 1.25 portions, Use by Tue. Had it, Threw it out or Freeze it' })
    await userEvent.click(row)
    expect(flow.openDetails).toHaveBeenCalledWith(2)
  })

  it('has no ⋮ on a row', () => {
    view()
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull()
  })

  it('a question keeps its inline answers and is not a row target', () => {
    const asked = l(3, 'Chilli', 2, '2026-11-05', { toAnswer: true })
    view([asked, ...list])
    const group = screen.getByRole('group', { name: /Chilli was to be used by/ })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Had it', 'Threw it out', "Wasn't there"])
  })

  it('without a flow the rows are plain (a static list)', () => {
    // (view(list, undefined) would take the default flow: render without one)
    const { container } = render(
      <MemoryRouter>
        <LeftoversTile leftovers={list} today={TODAY} />
      </MemoryRouter>,
    )
    expect(container.querySelectorAll('ul > li.list-row')).toHaveLength(2)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
