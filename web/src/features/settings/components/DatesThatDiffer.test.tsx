import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DatesThatDiffer } from './DatesThatDiffer'
import { dateRows, twoMembers } from './mealSlotCardFixtures'

describe('DatesThatDiffer (read-only)', () => {
  it('is a region with the upcoming dates, each with its label, the Meal Slot and what differs', () => {
    render(<DatesThatDiffer rows={dateRows} members={twoMembers} />)
    const region = screen.getByRole('region', { name: 'Dates that differ' })
    const items = within(region).getAllByRole('listitem').map((i) => i.textContent?.replace(/\s+/g, ' ').trim())
    expect(items[0]).toContain('Sat 14 Nov')
    expect(items[0]).toContain('Dinner')
    expect(items[0]).toContain('Not served')
    expect(items[1]).toContain('Sun 15 Nov')
    expect(items[1]).toContain('13:30 · usually 13:00')
  })
  it('has no buttons or links: the dates are made from the Plan', () => {
    render(<DatesThatDiffer rows={dateRows} members={twoMembers} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
  it('renders nothing without rows', () => {
    const { container } = render(<DatesThatDiffer rows={[]} members={twoMembers} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('names who eats on a date that changes the Attendance', () => {
    render(<DatesThatDiffer rows={[{ key: 'k', date: '2026-11-12', dateLabel: 'Thu 12 Nov', slotName: 'Dinner', parts: [{ kind: 'attendance', attendeeIds: [2] }] }]} members={twoMembers} />)
    expect(screen.getByText('Fabio only')).toBeInTheDocument()
  })
})
