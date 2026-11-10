import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Stepper } from './Stepper'

describe('Button', () => {
  it('defaults to type=button (never submits a surrounding form by accident)', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('exposes variant and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button variant="tonal" onClick={onClick}>Go</Button>)
    const b = screen.getByRole('button', { name: 'Go' })
    expect(b).toHaveAttribute('data-variant', 'secondary') // tonal is a deprecated alias; the rendered name is always the new one
    await userEvent.click(b)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('loading disables the button and sets aria-busy', async () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Save</Button>)
    const b = screen.getByRole('button', { name: /Save/ })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Stepper', () => {
  it('shows the value with its unit and steps by 1 by default', async () => {
    const onChange = vi.fn()
    render(<Stepper label="portions" value={4} unit="portions" onChange={onChange} />)
    expect(screen.getByText('4')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Increase portions' }))
    expect(onChange).toHaveBeenLastCalledWith(5)
    await userEvent.click(screen.getByRole('button', { name: 'Decrease portions' }))
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('uses a custom step', async () => {
    const onChange = vi.fn()
    render(<Stepper label="rice" value={100} step={25} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Increase rice' }))
    expect(onChange).toHaveBeenLastCalledWith(125)
  })

  it('disables the decrease button at min (default 0) and never goes below', async () => {
    const onChange = vi.fn()
    render(<Stepper label="eggs" value={0} onChange={onChange} />)
    const dec = screen.getByRole('button', { name: 'Decrease eggs' })
    expect(dec).toBeDisabled()
    await userEvent.click(dec)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables the increase button at max', () => {
    render(<Stepper label="eggs" value={12} max={12} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Increase eggs' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease eggs' })).toBeEnabled()
  })

  it('clamps a step that would overshoot the bounds', async () => {
    const onChange = vi.fn()
    render(<Stepper label="x" value={9} max={10} step={5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Increase x' }))
    expect(onChange).toHaveBeenLastCalledWith(10)
  })
})
