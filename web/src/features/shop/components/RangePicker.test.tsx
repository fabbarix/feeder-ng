import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RangePicker } from './RangePicker'

describe('RangePicker', () => {
  it('has a chip for every day up to the horizon, with the current range selected', () => {
    render(<RangePicker today="2026-11-09" maxTo="2026-11-15" to="2026-11-12" onChange={() => {}} />)
    const group = screen.getByRole('group', { name: 'Shop for' })
    expect(group.querySelectorAll('button')).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Thu 12' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Tomorrow' })).toBeInTheDocument()
  })

  it('chooses another last date', async () => {
    const onChange = vi.fn()
    render(<RangePicker today="2026-11-09" maxTo="2026-11-15" to="2026-11-15" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tomorrow' }))
    expect(onChange).toHaveBeenCalledWith('2026-11-10')
  })
})
