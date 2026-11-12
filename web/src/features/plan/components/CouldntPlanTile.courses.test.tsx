// CRS G2: the Couldn't plan tile per Course: Course names in the headline and the lines, the Exclusions lines as links,
// the fix of the new cause, and the keyboard.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { NO_COURSE_RECIPES, WEEK, dinner, empty, planned, sideWeek } from '../couldnt-fixtures'
import { useCauseExpansion } from '../hooks/useCauseExpansion'
import { useCouldntPlanNotice } from '../hooks/useCouldntPlanNotice'
import { courseCells, unplannedOf } from '../lib/couldntGroups'
import type { PlanSlot } from '../types'
import { CouldntPlanNotice } from './CouldntPlanNotice'
import { CouldntPlanTile } from './CouldntPlanTile'

function Notice({ slots, onFix = vi.fn() }: { slots: PlanSlot[]; onFix?: () => void }) {
  const notice = useCouldntPlanNotice(unplannedOf(courseCells(slots)), courseCells(slots))
  return <CouldntPlanNotice groups={notice.groups} onFix={onFix} />
}
const renderNotice = (slots: PlanSlot[], onFix?: () => void) =>
  render(
    <MemoryRouter>
      <Notice slots={slots} onFix={onFix} />
    </MemoryRouter>,
  )

describe('CouldntPlanTile: every Side excluded', () => {
  const slots = sideWeek(WEEK)

  it('says it once, per Course, with the summary that names the Course', () => {
    renderNotice(slots)
    expect(screen.getByRole('region', { name: "Couldn't plan 7 Sides. Every Recipe is excluded for someone who eats it." })).toBeInTheDocument()
    expect(screen.getByText('Side at every dinner this week')).toBeInTheDocument()
  })

  it('Show all 7 lists every Side, each line naming the Course', async () => {
    renderNotice(slots)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all 7' }))
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(7)
    expect(items[0]).toHaveTextContent('Tue 10 Nov · Dinner · Side')
  })

  it('each line of the Excluded tile is a link to its cell on the Review Exclusions page', async () => {
    renderNotice(slots)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 7' }))
    const link = screen.getByRole('link', { name: 'Fri 13 Nov · Dinner · Side' })
    expect(link).toHaveAttribute('href', '/plan/couldnt-plan/excluded#cell-2026-11-13-4-2')
    expect(screen.getAllByRole('link')).toHaveLength(7)
  })

  it('the fix is the Review Exclusions button, and it is offered to every User', async () => {
    const onFix = vi.fn()
    renderNotice(slots, onFix)
    await userEvent.click(screen.getByRole('button', { name: 'Review Exclusions' }))
    expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ cause: 'excluded' }))
    expect(screen.queryByText(/Ask an Admin/)).not.toBeInTheDocument()
  })

  it('is warn (amber), not danger', () => {
    const { container } = renderNotice(slots)
    const tile = container.querySelector('[data-cause="excluded"]')!
    expect(tile).toHaveAttribute('data-couldnt-tone', 'warn')
    expect(tile).toHaveAttribute('data-status', 'spoil')
  })
})

describe('CouldntPlanTile: No Recipes for this Course', () => {
  const slots = WEEK.slice(0, 5).map((d) => dinner(d, [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)]))

  it('is an info tile with the Course in the headline and "Mark Recipes as Dessert" as its fix', () => {
    const { container } = renderNotice(slots)
    expect(screen.getByRole('heading', { name: "Couldn't plan 5 Desserts. No Recipes are marked as Dessert." })).toBeInTheDocument()
    const tile = container.querySelector('[data-cause="no_course_recipes"]')!
    expect(tile).toHaveAttribute('data-couldnt-tone', 'info')
    expect(tile).toHaveAttribute('data-status', 'info')
    expect(tile.querySelector('.tile__overline svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Mark Recipes as Dessert' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('its lines are plain text (only the Excluded cause links to the page)', async () => {
    renderNotice(slots)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 5' }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')[0]).toHaveTextContent('Tue 10 Nov · Dinner · Dessert')
  })
})

describe('CouldntPlanTile: Show all counts the lines it lists', () => {
  it('a slot whose every Course has the cause is one line, so there is nothing to show', () => {
    renderNotice([dinner('2026-11-13', [empty(1, 'Main', NO_COURSE_RECIPES), empty(3, 'Dessert', NO_COURSE_RECIPES)])])
    expect(screen.getByRole('heading', { name: /^Couldn't plan 2 Courses\./ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })
})

describe('CouldntPlanTile: keyboard', () => {
  function Wrapped({ slots }: { slots: PlanSlot[] }) {
    const notice = useCouldntPlanNotice(unplannedOf(courseCells(slots)), courseCells(slots))
    const [fixed, setFixed] = useState(0)
    const expansion = useCauseExpansion()
    return (
      <MemoryRouter>
        <p>fixed {fixed}</p>
        {notice.groups.map((g) => (
          <CouldntPlanTile key={g.cause} group={g} expanded={expansion.isOpen(g.cause)} onToggle={() => expansion.toggle(g.cause)} onFix={() => setFixed(fixed + 1)} />
        ))}
      </MemoryRouter>
    )
  }

  it('Tab reaches Show all, then the fix; Enter and Space open and close the list; Tab then walks the links in order', async () => {
    render(<Wrapped slots={sideWeek(['2026-11-10', '2026-11-11'])} />)
    await userEvent.tab()
    const toggle = screen.getByRole('button', { name: 'Show all 2' })
    expect(toggle).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Hide the list' })).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Show all 2' })).toHaveAttribute('aria-expanded', 'false')
    await userEvent.keyboard('{Enter}')
    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Tue 10 Nov · Dinner · Side' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Wed 11 Nov · Dinner · Side' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Review Exclusions' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByText('fixed 1')).toBeInTheDocument()
  })

  it('the Show all button points at the list it opens', async () => {
    render(<Wrapped slots={sideWeek(['2026-11-10', '2026-11-11'])} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 2' }))
    const button = screen.getByRole('button', { name: 'Hide the list' })
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toBe(screen.getByRole('list'))
  })
})
