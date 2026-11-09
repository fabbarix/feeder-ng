import { render, screen } from '@testing-library/react'
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
