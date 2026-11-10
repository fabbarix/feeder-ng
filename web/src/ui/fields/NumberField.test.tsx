import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'

function Num(props: Partial<React.ComponentProps<typeof NumberField>> & { initial?: number | null; onValue?: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(props.initial === undefined ? 4 : props.initial)
  const { initial: _i, onValue, ...rest } = props
  return <NumberField label="Portions" {...rest} value={value} onChange={(v) => { setValue(v); onValue?.(v) }} />
}
const input = () => screen.getByRole('spinbutton', { name: 'Portions' })

describe('NumberField', () => {
  it('is a text input (inputmode decimal), not a native number input', () => {
    render(<Num />)
    expect(input()).toHaveAttribute('type', 'text')
    expect(input()).toHaveAttribute('inputmode', 'decimal')
    expect(input()).toHaveValue('4')
  })

  it('shows the unit and exposes bounds', () => {
    render(<Num unit="g" min={0} max={500} />)
    expect(screen.getByText('g')).toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-valuemin', '0')
    expect(input()).toHaveAttribute('aria-valuemax', '500')
    expect(input()).toHaveAttribute('aria-valuenow', '4')
  })

  it('ArrowUp/ArrowDown step by step and commit', async () => {
    const onValue = vi.fn()
    render(<Num step={0.5} onValue={onValue} />)
    input().focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onValue).toHaveBeenLastCalledWith(4.5)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(onValue).toHaveBeenLastCalledWith(3.5)
  })

  it('does not fire per keystroke; commits typed text on blur, accepting a decimal comma', async () => {
    const onValue = vi.fn()
    render(<Num onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '2,5')
    expect(onValue).not.toHaveBeenCalled()
    await userEvent.tab()
    expect(onValue).toHaveBeenCalledTimes(1)
    expect(onValue).toHaveBeenLastCalledWith(2.5)
  })

  it('Enter commits', async () => {
    const onValue = vi.fn()
    render(<Num onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '8{Enter}')
    expect(onValue).toHaveBeenLastCalledWith(8)
  })

  it('clamps to max and min on commit and shows the clamped text', async () => {
    const onValue = vi.fn()
    render(<Num min={1} max={100} onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '150')
    await userEvent.tab()
    expect(onValue).toHaveBeenLastCalledWith(100)
    expect(input()).toHaveValue('100')
    await userEvent.clear(input())
    await userEvent.type(input(), '0')
    await userEvent.tab()
    expect(onValue).toHaveBeenLastCalledWith(1)
  })

  it('reverts invalid text to the last value without calling onChange', async () => {
    const onValue = vi.fn()
    render(<Num onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.type(input(), 'abc')
    await userEvent.tab()
    expect(onValue).not.toHaveBeenCalled()
    expect(input()).toHaveValue('4')
  })

  it('emptying the field commits null', async () => {
    const onValue = vi.fn()
    render(<Num onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.tab()
    expect(onValue).toHaveBeenLastCalledWith(null)
  })

  it('has labelled ± buttons that respect the bounds, unless hidden', async () => {
    const onValue = vi.fn()
    const { unmount } = render(<Num max={4} onValue={onValue} />)
    expect(screen.getByRole('button', { name: 'Increase Portions' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Portions' }))
    expect(onValue).toHaveBeenLastCalledWith(3)
    unmount()
    render(<Num hideStepper />)
    expect(screen.queryByRole('button', { name: 'Increase Portions' })).toBeNull()
  })

  it('links helper and error text', () => {
    render(<Num helper="Per serving" error="Too many" />)
    expect(input()).toHaveAccessibleDescription(/Per serving/)
    expect(input()).toHaveAccessibleDescription(/Too many/)
    expect(input()).toHaveAttribute('aria-invalid', 'true')
  })
})
