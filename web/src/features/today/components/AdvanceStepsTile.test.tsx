// B9-44 (TB-02, TB-09; changed on purpose): the Advance Steps tile is an info status tile with a TileHeader (alarm badge in the info
// tone, the title, a count), one row per not-done Step due in the next 24 h (a When badge, the Step text, the meta, Done), the first 4 and
// "Show N more". Done calls onDone(step); the toast is the hook's (hooks/useAdvanceStepDone.test.tsx).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AdvanceStepDue } from '../types'
import { AdvanceStepsTile } from './AdvanceStepsTile'

const mk = (i: number, over: Partial<AdvanceStepDue> = {}): AdvanceStepDue => ({
  scope: `plan:2026-11-10:2:${i}`, step: i, mealDate: '2026-11-10', mealSlotId: 2, mealSlotName: 'Dinner', recipeName: 'Cauliflower al gorgonzola',
  description: `Step number ${i}`, dueAt: '2026-11-09T18:00:00Z', dueTime: '19:00', slotTime: '19:00', state: 'upcoming', overdue: false, ...over,
})
const props = { today: '2026-11-09', timeZone: 'Europe/Rome', onDone: () => {} }

describe('AdvanceStepsTile: the tile', () => {
  it('is a section named by its h2 "Advance Steps", an info status tile', () => {
    const { container } = render(<AdvanceStepsTile steps={[mk(1)]} {...props} />)
    const section = screen.getByRole('region', { name: 'Advance Steps' })
    expect(section).toHaveAttribute('data-variant', 'status')
    expect(section).toHaveAttribute('data-status', 'info')
    const h2 = within(section).getByRole('heading', { level: 2, name: 'Advance Steps' })
    expect(section).toHaveAttribute('aria-labelledby', h2.id)
    expect(container.querySelectorAll('.tile-header')).toHaveLength(1)
  })

  it('the header has an info badge and a count of the rows; no trailing link, no bare h2 style of the old tile', () => {
    const { container } = render(<AdvanceStepsTile steps={[mk(1), mk(2)]} {...props} />)
    expect(container.querySelector('.tile-header__badge')).toHaveAttribute('data-tone', 'info')
    expect(container.querySelector('.tile-header .chip[data-kind="count"]')).toHaveTextContent('2')
    expect(container.querySelector('.tile-header__action')).toBeNull()
    expect(container.querySelector('.today__tile-title')).toBeNull()
  })

  it('renders nothing when there are no Steps', () => {
    const { container } = render(<AdvanceStepsTile steps={[]} {...props} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('AdvanceStepsTile: a row', () => {
  it('is an li in a ul, with a When badge, the Step text and the meta "For <Day> <Meal Slot> · <Recipe>"', () => {
    const { container } = render(<AdvanceStepsTile steps={[mk(1)]} {...props} />)
    const li = container.querySelector('ul > li')!
    expect(li).not.toBeNull()
    expect(within(li as HTMLElement).getByText('Step number 1')).toBeInTheDocument()
    expect(within(li as HTMLElement).getByText('For Tue Dinner · Cauliflower al gorgonzola')).toBeInTheDocument()
    const badge = li.querySelector('.advance-step__when')!
    expect(badge.textContent).toBe('Today19:00')
    expect([...badge.children].map((c) => c.textContent)).toEqual(['Today', '19:00'])
  })

  it('an overdue Step has the solid info badge reading Overdue', () => {
    const { container } = render(<AdvanceStepsTile steps={[mk(1, { overdue: true, dueAt: '2026-11-08T18:00:00Z' })]} {...props} />)
    const badge = container.querySelector('.advance-step__when')!
    expect(badge).toHaveAttribute('data-overdue', 'true')
    expect(badge.children[0]).toHaveTextContent('Overdue')
  })

  it('a normal badge is not marked overdue', () => {
    const { container } = render(<AdvanceStepsTile steps={[mk(1)]} {...props} />)
    expect(container.querySelector('.advance-step__when')).not.toHaveAttribute('data-overdue', 'true')
  })

  it('Done is a secondary md button named "Done: <Step text>" with a visible "Done"', async () => {
    const onDone = vi.fn()
    render(<AdvanceStepsTile steps={[mk(1), mk(2)]} {...props} onDone={onDone} />)
    const done = screen.getByRole('button', { name: 'Done: Step number 2' })
    expect(done).toHaveAttribute('data-variant', 'secondary')
    expect(done).toHaveAttribute('data-size', 'md')
    expect(done).toHaveTextContent('Done')
    await userEvent.click(done)
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ scope: 'plan:2026-11-10:2:2', step: 2 }))
  })

  it('offline, Done is disabled with the title "Needs a connection"', () => {
    render(<AdvanceStepsTile steps={[mk(1)]} {...props} offline />)
    const done = screen.getByRole('button', { name: 'Done: Step number 1' })
    expect(done).toBeDisabled()
    expect(done).toHaveAttribute('title', 'Needs a connection')
  })

  it('lists the Steps in the order given', () => {
    render(<AdvanceStepsTile steps={[mk(3), mk(1)]} {...props} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)[0]).toContain('Step number 3')
  })
})

describe('AdvanceStepsTile: more than 4 rows', () => {
  it('shows the first 4 and a secondary "Show 2 more", which shows the rest and then offers "Show fewer"', async () => {
    render(<AdvanceStepsTile steps={[1, 2, 3, 4, 5, 6].map((i) => mk(i))} {...props} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    const more = screen.getByRole('button', { name: 'Show 2 more' })
    expect(more).toHaveAttribute('data-variant', 'secondary')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    const fewer = screen.getByRole('button', { name: 'Show fewer' })
    expect(fewer).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(fewer)
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('has no Show button for 4 rows or fewer', () => {
    render(<AdvanceStepsTile steps={[1, 2, 3, 4].map((i) => mk(i))} {...props} />)
    expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull()
  })
})

describe('AdvanceStepsTile: focus after Done', () => {
  const rows = [1, 2, 3].map((i) => mk(i))
  it('moves to the next row’s Done when a row goes', async () => {
    const { rerender } = render(<AdvanceStepsTile steps={rows} {...props} />)
    const second = screen.getByRole('button', { name: 'Done: Step number 2' })
    second.focus()
    await userEvent.click(second)
    rerender(<AdvanceStepsTile steps={[rows[0]!, rows[2]!]} {...props} />)
    expect(screen.getByRole('button', { name: 'Done: Step number 3' })).toHaveFocus()
  })

  it('moves to the previous row’s Done after the last row', async () => {
    const { rerender } = render(<AdvanceStepsTile steps={rows} {...props} />)
    const last = screen.getByRole('button', { name: 'Done: Step number 3' })
    last.focus()
    await userEvent.click(last)
    rerender(<AdvanceStepsTile steps={[rows[0]!, rows[1]!]} {...props} />)
    expect(screen.getByRole('button', { name: 'Done: Step number 2' })).toHaveFocus()
  })
})
