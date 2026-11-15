import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { anna, marco, members, sam } from './fixtures'
import { AttendanceEditor } from './AttendanceEditor'
import type { AttendanceEntry } from '../types'

const value: AttendanceEntry[] = [
  { memberId: anna.id, portionFactorOverride: null },
  { memberId: marco.id, portionFactorOverride: null },
  { memberId: sam.id, portionFactorOverride: null },
]

describe('AttendanceEditor', () => {
  it('ticks the attending Members and sums their Portion Factors', () => {
    render(<AttendanceEditor members={members} value={value} onChange={() => {}} />)
    expect(screen.getByRole('checkbox', { name: 'Anna' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Sam' })).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Portions needed: 2.5')
  })

  it('shows who is out', () => {
    render(<AttendanceEditor members={members} value={[value[0]!]} onChange={() => {}} />)
    expect(screen.getByRole('checkbox', { name: 'Marco' })).not.toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Portions needed: 1')
  })

  it('unticking removes the Member from the Attendance', async () => {
    const onChange = vi.fn()
    render(<AttendanceEditor members={members} value={value} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    expect(onChange).toHaveBeenCalledWith([value[0], value[1]])
  })

  it('ticking adds the Member at their default Portion Factor', async () => {
    const onChange = vi.fn()
    render(<AttendanceEditor members={members} value={[value[0]!]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    expect(onChange).toHaveBeenCalledWith([value[0], { memberId: 3, portionFactorOverride: null }])
  })

  it('overrides one Member\'s Portion Factor in 0.25 steps, and goes back to the default', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<AttendanceEditor members={members} value={value} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Increase Portion Factor for Sam' }))
    expect(onChange).toHaveBeenLastCalledWith([value[0], value[1], { memberId: 3, portionFactorOverride: 0.75 }])
    rerender(<AttendanceEditor members={members} value={[value[0]!, value[1]!, { memberId: 3, portionFactorOverride: 0.75 }]} onChange={onChange} />)
    expect(screen.getByRole('status')).toHaveTextContent('Portions needed: 2.75')
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Portion Factor for Sam' }))
    expect(onChange).toHaveBeenLastCalledWith(value)
  })

  it('has no stepper for a Member who is not attending', () => {
    render(<AttendanceEditor members={members} value={[value[0]!]} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Increase Portion Factor for Sam' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Increase Portion Factor for Anna' })).toBeInTheDocument()
  })

  it('asks for Members first when there are none', () => {
    render(<AttendanceEditor members={[]} value={[]} onChange={() => {}} />)
    expect(screen.getByText(/add Members first/i)).toBeInTheDocument()
  })
})

// SET-10: each Member is one row in the ListRow anatomy: [checkbox 44] [Avatar 40] [name, 2 lines] [Stepper, or "Not eating"]. A long name never
// pushes the stepper onto a line that belongs to nobody. The same component serves "Who's eating" in Change a date.
describe('AttendanceEditor: one row per Member (SET-10)', () => {
  const rowOf = (name: string) => screen.getByRole('checkbox', { name }).closest('li')!

  it('is a list with one item per Member, in the Members order', () => {
    const { container } = render(<AttendanceEditor members={members} value={value} onChange={() => {}} />)
    expect(container.querySelector('ul.attendance')).not.toBeNull()
    expect(within(container.querySelector('ul.attendance') as HTMLElement).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? c.id)).toHaveLength(3)
  })

  it('the checkbox comes before the Avatar in the row (the control first, then the picture, then the name)', () => {
    render(<AttendanceEditor members={members} value={value} onChange={() => {}} />)
    const row = rowOf('Anna')
    const checkbox = within(row).getByRole('checkbox', { name: 'Anna' })
    const avatar = row.querySelector('.avatar, [data-avatar]')!
    expect(avatar).not.toBeNull()
    expect(checkbox.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the checkbox is labelled by the Member\'s name element (one name, not two)', () => {
    render(<AttendanceEditor members={members} value={value} onChange={() => {}} />)
    const row = rowOf('Marco')
    const name = row.querySelector('.attendance__name') as HTMLElement
    expect(name).toHaveTextContent('Marco')
    expect(within(row).getByRole('checkbox', { name: 'Marco' })).toHaveAccessibleName('Marco')
    expect(within(row).getAllByText('Marco')).toHaveLength(1)
  })

  it('the Avatar is decorative here: the name already says whose row it is', () => {
    render(<AttendanceEditor members={members} value={value} onChange={() => {}} />)
    expect(within(rowOf('Anna')).queryByRole('img')).toBeNull()
  })

  it('an attending Member has the stepper as the last item of the row; a Member who is out has a muted "Not eating" in its place', () => {
    render(<AttendanceEditor members={members} value={[value[0]!]} onChange={() => {}} />)
    const out = rowOf('Marco')
    expect(within(out).getByText('Not eating')).toHaveClass('attendance__off')
    expect(within(out).queryByRole('button', { name: /Portion Factor/ })).toBeNull()
    const inRow = rowOf('Anna')
    expect(within(inRow).queryByText('Not eating')).toBeNull()
    const stepper = inRow.querySelector('.attendance__step') as HTMLElement
    expect(within(stepper).getByRole('button', { name: 'Increase Portion Factor for Anna' })).toBeInTheDocument()
    expect(inRow.lastElementChild).toBe(stepper)
  })

  it('a very long Member name stays in one name element (CSS clamps it to two lines; the stepper keeps its own cell)', () => {
    const long = { ...sam, id: 9, name: 'Maximiliana Wolfeschlegelsteinhausen Bernadette' }
    render(<AttendanceEditor members={[long]} value={[{ memberId: 9, portionFactorOverride: null }]} onChange={() => {}} />)
    const row = rowOf(long.name)
    expect(row.querySelectorAll('.attendance__name')).toHaveLength(1)
    expect(row.querySelector('.attendance__step')).not.toBeNull()
  })

  it('the status line "Portions needed" stays outside the list, after it', () => {
    const { container } = render(<AttendanceEditor members={members} value={value} onChange={() => {}} />)
    const list = container.querySelector('ul.attendance')!
    expect(list.contains(screen.getByRole('status'))).toBe(false)
  })

  // Where the Away UI (B9-46) plugs in: "Eats here anyway" for a Member who is away goes in `memberExtra`, under the Member's name.
  it('memberExtra renders in the row of that Member, after the name, and is told the Member and the entry', () => {
    const memberExtra = vi.fn((m: { id: number }) => (m.id === 3 ? <span data-testid="extra">Away</span> : null))
    render(<AttendanceEditor members={members} value={value} onChange={() => {}} memberExtra={memberExtra} />)
    const row = rowOf('Sam')
    const extra = within(row).getByTestId('extra')
    expect(extra.closest('.attendance__main')).not.toBeNull()
    expect(memberExtra).toHaveBeenCalledWith(sam, value[2])
    expect(screen.queryAllByTestId('extra')).toHaveLength(1)
  })
})
