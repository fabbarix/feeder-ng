// New-API tests for Stepper (plan 4.10). The old Stepper block of Controls.test.tsx stays valid.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

describe('Stepper (accessible, decimals)', () => {
  it('is a group named by its label, with a spinbutton exposing value and bounds', () => {
    render(<Stepper label="portions" value={4} min={1} max={12} onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'portions' })).toBeInTheDocument()
    const spin = screen.getByRole('spinbutton', { name: 'portions' })
    expect(spin).toHaveAttribute('aria-valuenow', '4')
    expect(spin).toHaveAttribute('aria-valuemin', '1')
    expect(spin).toHaveAttribute('aria-valuemax', '12')
  })

  it('ArrowUp/ArrowDown on the focused value step it; Home/End jump to the bounds', async () => {
    const onChange = vi.fn()
    render(<Stepper label="portions" value={4} min={1} max={12} onChange={onChange} />)
    screen.getByRole('spinbutton', { name: 'portions' }).focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith(5)
    await userEvent.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith(3)
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith(1)
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith(12)
  })

  it('steps decimals without float drift (0.1 + 0.2 = 0.3)', async () => {
    const onChange = vi.fn()
    render(<Stepper label="flour" value={0.1} step={0.2} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Increase flour' }))
    expect(onChange).toHaveBeenLastCalledWith(0.3)
  })

  it('shows the unit after the value', () => {
    render(<Stepper label="rice" value={150} unit="g" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'rice' })).toHaveTextContent('150')
    expect(screen.getByRole('group', { name: 'rice' })).toHaveTextContent('g')
  })

  it('the − and + controls are labelled IconButtons (44 px hit area comes from IconButton)', () => {
    render(<Stepper label="eggs" value={2} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Decrease eggs' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Increase eggs' })).toBeEnabled()
  })
})

describe('Stepper size xs (SR4: inside a list row)', () => {
  it('uses the compact 32 px IconButtons and keeps the group, spinbutton and button names', async () => {
    const onChange = vi.fn()
    render(<Stepper label="Quantity of Mutti passata" value={2} min={1} size="xs" onChange={onChange} />)
    const group = screen.getByRole('group', { name: 'Quantity of Mutti passata' })
    expect(group).toHaveAttribute('data-size', 'xs')
    const plus = screen.getByRole('button', { name: 'Increase Quantity of Mutti passata' })
    expect(plus).toHaveAttribute('data-size', 'compact')
    expect(screen.getByRole('button', { name: 'Decrease Quantity of Mutti passata' })).toHaveAttribute('data-size', 'compact')
    await userEvent.click(plus)
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('md and sm keep the 40 px IconButtons', () => {
    render(<Stepper label="portions" value={2} size="sm" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Increase portions' })).toHaveAttribute('data-size', 'md')
  })
})
