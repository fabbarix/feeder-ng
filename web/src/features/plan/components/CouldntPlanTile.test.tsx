import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import { groupByCause } from '../lib/couldntGroups'
import { summarizeSlots } from '../lib/couldntSummary'
import { slot } from '../test-utils'
import type { Eliminations, PlanSlot, UnfilledReason } from '../types'
import { CouldntPlanNotice } from './CouldntPlanNotice'
import { CouldntPlanTile } from './CouldntPlanTile'

const none: Eliminations = { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }
function unplanned(date: string, reason: UnfilledReason, over: Partial<Eliminations> = {}, name = 'Dinner', id = 2): PlanSlot {
  return slot({ date, name, mealSlotId: id, meal: null, unfilled: { reason, slotRuleClaimed: false, eliminated: { ...none, ...over } } })
}
function noticeGroups(slots: PlanSlot[]): NoticeGroup[] {
  return groupByCause(slots).map((g) => ({ ...g, summary: summarizeSlots(g.slots, slots), canFix: true }))
}
const dinners = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'].map((d, i) => unplanned(d, 'no_attendance', {}, 'Dinner', 10 + i))
const breakfasts = ['2026-11-14', '2026-11-15'].map((d, i) => unplanned(d, 'no_attendance', {}, 'Breakfast', 20 + i))
const nine = noticeGroups([...dinners, ...breakfasts])[0]!

function setup(group: NoticeGroup = nine, expanded = false) {
  const h = { onToggle: vi.fn(), onFix: vi.fn() }
  const view = render(<CouldntPlanTile group={group} expanded={expanded} {...h} />)
  return { ...h, view }
}

describe('CouldntPlanTile: one compact tile per cause', () => {
  it('says what happened in one sentence and summarises the affected meals', () => {
    setup()
    expect(screen.getByRole('heading', { name: "Couldn't plan 9 Meal Slots. Nobody is set to attend." })).toBeInTheDocument()
    expect(screen.getByText('Every dinner this week, plus weekend breakfasts')).toBeInTheDocument()
    expect(screen.getByText('Pick the Members who eat at each Meal Slot, and the planner will fill it.')).toBeInTheDocument()
  })

  it('is never one line per slot: the nine meals are not listed until asked', () => {
    setup()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText('Tue 10 Nov · Dinner')).not.toBeInTheDocument()
  })

  it('an expand control lists every meal, one short line each', async () => {
    const h = setup()
    const toggle = screen.getByRole('button', { name: 'Show all 9' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(h.onToggle).toHaveBeenCalledTimes(1)
    h.view.unmount()
    setup(nine, true)
    expect(screen.getByRole('button', { name: 'Hide the list' })).toHaveAttribute('aria-expanded', 'true')
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(9)
    expect(items[0]).toHaveTextContent('Tue 10 Nov · Dinner')
  })

  it('a single meal needs no expand control', () => {
    setup(noticeGroups([unplanned('2026-11-10', 'no_attendance')])[0]!)
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
    expect(screen.getByText('Tuesday dinner')).toBeInTheDocument()
  })

  it('has one fix action, a secondary button named for the cause', async () => {
    const h = setup()
    const fix = screen.getByRole('button', { name: 'Choose who attends' })
    expect(fix).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(fix)
    expect(h.onFix).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button').filter((b) => !/Show all|Hide/.test(b.textContent ?? ''))).toHaveLength(1)
  })

  it('a setup gap (info) is a soft tile with an icon, not the danger colour', () => {
    const { container } = setup().view
    const tile = container.querySelector('[data-cause="nobody_attending"]') as HTMLElement
    expect(tile).toHaveAttribute('data-couldnt-tone', 'info')
    expect(tile).toHaveAttribute('data-variant', 'soft')
    expect(tile.querySelector('[data-status="danger"]')).toBeNull()
    expect(tile).not.toHaveAttribute('data-status', 'danger')
    expect(tile.querySelector('.tile__overline svg')).not.toBeNull()
    expect(screen.getByText("Couldn't plan")).toBeInTheDocument()
  })

  it('R13 owns its tone attribute: the shared Tile data-tone is left alone', () => {
    const { container } = setup().view
    const tile = container.querySelector('[data-cause="nobody_attending"]') as HTMLElement
    expect(tile).toHaveAttribute('data-couldnt-tone', 'info')
    expect(tile).not.toHaveAttribute('data-tone')
  })

  it('a member who cannot change the fix gets no button, and is told who can', () => {
    setup({ ...nine, canFix: false })
    expect(screen.queryByRole('button', { name: 'Choose who attends' })).not.toBeInTheDocument()
    expect(screen.getByText(/Ask an Admin/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all 9' })).toBeInTheDocument()
  })

  it('a rule conflict (warn) is the amber status tile', () => {
    const warn = noticeGroups([unplanned('2026-11-10', 'no_candidates', { considered: 2, coolDown: 2 })])[0]!
    const { container } = setup(warn).view
    const tile = container.querySelector('[data-cause="cool_down"]') as HTMLElement
    expect(tile).toHaveAttribute('data-couldnt-tone', 'warn')
    expect(tile).toHaveAttribute('data-variant', 'status')
    expect(tile).toHaveAttribute('data-status', 'spoil')
  })

  it('is a wide tile in the grid: two columns', () => {
    const { container } = setup().view
    expect(container.querySelector('[data-cause]')).toHaveAttribute('data-span', '2')
  })

  it('a section named by its heading, not an alarm', () => {
    setup()
    expect(screen.getByRole('region', { name: "Couldn't plan 9 Meal Slots. Nobody is set to attend." })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('CouldntPlanNotice: one tile per cause', () => {
  const cool = unplanned('2026-11-12', 'no_candidates', { considered: 3, coolDown: 3 }, 'Lunch', 5)

  it('nine identical slots are one tile', () => {
    render(<CouldntPlanNotice groups={noticeGroups([...dinners, ...breakfasts])} onFix={() => {}} />)
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(screen.queryByText(/^Couldn't plan (Tuesday|Wednesday)/)).not.toBeInTheDocument()
  })

  it('several causes are several tiles, each with its own fix', async () => {
    const onFix = vi.fn()
    render(<CouldntPlanNotice groups={noticeGroups([...dinners, cool])} onFix={onFix} />)
    expect(screen.getAllByRole('region')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Review Cool-down' }))
    expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ cause: 'cool_down' }))
    await userEvent.click(screen.getByRole('button', { name: 'Choose who attends' }))
    expect(onFix).toHaveBeenLastCalledWith(expect.objectContaining({ cause: 'nobody_attending' }))
  })

  it('expanding one tile leaves the others collapsed', async () => {
    render(<CouldntPlanNotice groups={noticeGroups([...dinners, cool])} onFix={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 7' }))
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Hide the list' })).toBeInTheDocument()
  })

  it('renders nothing when everything was planned', () => {
    const { container } = render(<CouldntPlanNotice groups={[]} onFix={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nothing in it uses the danger status', () => {
    const { container } = render(<CouldntPlanNotice groups={noticeGroups([...dinners, cool, unplanned('2026-11-11', 'no_candidates')])} onFix={() => {}} />)
    expect(container.querySelector('[data-status="danger"]')).toBeNull()
  })
})
