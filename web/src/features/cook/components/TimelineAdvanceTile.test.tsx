// CRS F (spec 11): the Advance Steps of every Course, grouped by Course, outside the timeline.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { advanceGroups } from '../lib/timeline'
import { MAIN_SCOPE, SIDE_SCOPE, timelineView } from '../timeline-fixtures'
import { TimelineAdvanceTile } from './TimelineAdvanceTile'

const adv = (courseId: number, step: number, text: string, done = false) => ({
  courseId, scope: courseId === 1 ? MAIN_SCOPE : SIDE_SCOPE, step, text, leadTimeMinutes: 240, done, doneAt: done ? '2026-11-10T08:00:00Z' : null, warning: !done,
})

describe('TimelineAdvanceTile', () => {
  const groups = () => advanceGroups(timelineView({ advance: [adv(1, 0, 'Defrost', true), adv(1, 1, 'Marinate the chicken'), adv(2, 0, 'Soak the beans')] }))

  it('lists done ones as done and the others with their lead time, under the Course name', () => {
    render(<TimelineAdvanceTile groups={groups()} onMarkDone={() => {}} />)
    const main = screen.getByRole('group', { name: 'Main' })
    expect(within(main).getByText('Done: Defrost')).toBeInTheDocument()
    expect(within(main).getByText('Marinate the chicken · 4 h ahead')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Side' })).getByText('Soak the beans · 4 h ahead')).toBeInTheDocument()
  })

  it('Done marks the Step with the scope of its own Course', async () => {
    const onMarkDone = vi.fn()
    render(<TimelineAdvanceTile groups={groups()} onMarkDone={onMarkDone} />)
    await userEvent.click(within(screen.getByRole('group', { name: 'Side' })).getByRole('button', { name: 'Done' }))
    expect(onMarkDone).toHaveBeenCalledWith(SIDE_SCOPE, 0)
    await userEvent.click(within(screen.getByRole('group', { name: 'Main' })).getByRole('button', { name: 'Done' }))
    expect(onMarkDone).toHaveBeenCalledWith(MAIN_SCOPE, 1)
  })

  it('one Course with Advance Steps has no Course sub-heading', () => {
    render(<TimelineAdvanceTile groups={advanceGroups(timelineView({ advance: [adv(1, 1, 'Marinate the chicken')] }))} onMarkDone={() => {}} />)
    expect(screen.queryByRole('group', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.getByText('Marinate the chicken · 4 h ahead')).toBeInTheDocument()
  })

  it('renders nothing when nothing is pending', () => {
    const { container } = render(<TimelineAdvanceTile groups={advanceGroups(timelineView({ advance: [adv(1, 0, 'Defrost', true)] }))} onMarkDone={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
