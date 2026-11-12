import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AttendanceStack } from './AttendanceStack'
import { sixMembers, twoMembers } from './mealSlotCardFixtures'

describe('AttendanceStack', () => {
  it('renders nothing for everyone or nobody', () => {
    const a = render(<AttendanceStack attendance={{ state: 'everyone' }} members={twoMembers} label="Attending Dinner" />)
    expect(a.container).toBeEmptyDOMElement()
    const b = render(<AttendanceStack attendance={{ state: 'nobody' }} members={twoMembers} label="Attending Dinner" />)
    expect(b.container).toBeEmptyDOMElement()
  })
  it('is a list named by the label with one Avatar per Member, in the Members order, and the "only" text', () => {
    render(<AttendanceStack attendance={{ state: 'some', memberIds: [2, 1] }} members={twoMembers} label="Attending Dinner" />)
    const list = screen.getByRole('list', { name: 'Attending Dinner' })
    expect(within(list).getAllByRole('img').map((i) => i.getAttribute('aria-label'))).toEqual(['Mia', 'Fabio'])
    expect(screen.getByText('Mia, Fabio only')).toBeInTheDocument()
  })
  it('shows at most `max` Avatars (default 4) then "+N"', () => {
    render(<AttendanceStack attendance={{ state: 'some', memberIds: [1, 2, 3, 4, 5, 6] }} members={sixMembers} label="Attending Dinner" />)
    expect(within(screen.getByRole('list')).getAllByRole('img')).toHaveLength(4)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })
  it('honours a smaller max', () => {
    render(<AttendanceStack attendance={{ state: 'some', memberIds: [1, 2, 3] }} members={sixMembers} max={2} label="x" />)
    expect(within(screen.getByRole('list')).getAllByRole('img')).toHaveLength(2)
    expect(screen.getByText('+1')).toBeInTheDocument()
  })
})
