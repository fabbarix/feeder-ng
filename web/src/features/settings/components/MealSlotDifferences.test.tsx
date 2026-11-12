import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MealSlotDifferences } from './MealSlotDifferences'
import { dinnerCard, lunchCard, twoMembers } from './mealSlotCardFixtures'

describe('MealSlotDifferences', () => {
  it('renders nothing when no day differs', () => {
    const { container } = render(<MealSlotDifferences card={lunchCard} members={twoMembers} canEdit onEdit={vi.fn()} locale="en" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('has a "Differs on" heading and one row per differing day', () => {
    render(<MealSlotDifferences card={dinnerCard} members={twoMembers} canEdit onEdit={vi.fn()} locale="en" />)
    expect(screen.getByText('Differs on')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Differs on' })).getAllByRole('listitem')).toHaveLength(2)
  })
  it('lays the weekday out as its own column; the parts carry " · " between them only, never a leading or trailing one', () => {
    render(<MealSlotDifferences card={dinnerCard} members={twoMembers} canEdit onEdit={vi.fn()} locale="en" />)
    const rows = within(screen.getByRole('list', { name: 'Differs on' })).getAllByRole('listitem')
    const day = (r: HTMLElement) => r.querySelector('[data-part="weekday"]')
    const parts = (r: HTMLElement) => r.querySelector('[data-part="parts"]')
    expect(rows.map((r) => day(r)?.textContent)).toEqual(['Wed', 'Fri'])
    expect(rows.map((r) => parts(r)?.textContent)).toEqual(['Fabio only', '20:00 · Main only'])
    for (const r of rows) expect(parts(r)!.contains(day(r))).toBe(false)
  })
  it('an Admin row is a button that opens that weekday\'s Meal Slot', async () => {
    const onEdit = vi.fn()
    render(<MealSlotDifferences card={dinnerCard} members={twoMembers} canEdit onEdit={onEdit} locale="en" />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Dinner on Friday: 20:00, Main only' }))
    expect(onEdit).toHaveBeenCalledWith(dinnerCard.differences[1]!.slot)
  })
  it('a plain User\'s rows are plain text', () => {
    render(<MealSlotDifferences card={dinnerCard} members={twoMembers} canEdit={false} onEdit={vi.fn()} locale="en" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
