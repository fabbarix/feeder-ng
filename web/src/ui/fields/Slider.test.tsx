import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Slider } from './Slider'

const stops = [
  { value: 0, label: 'Familiar' },
  { value: 1, label: 'Balanced' },
  { value: 2, label: 'Adventurous' },
]

function Sl(props: { initial?: number; onValue?: (v: number) => void; withStops?: boolean }) {
  const [v, setV] = useState(props.initial ?? 1)
  return <Slider label="Planner Style" min={0} max={2} step={1} stops={props.withStops === false ? undefined : stops} value={v} onChange={(x) => { setV(x); props.onValue?.(x) }} />
}
const thumb = () => screen.getByRole('slider', { name: 'Planner Style' })

describe('Slider', () => {
  it('is a role=slider (not a native range input) with value, bounds and the stop label as text', () => {
    const { container } = render(<Sl />)
    expect(container.querySelector('input[type=range]')).toBeNull()
    expect(thumb()).toHaveAttribute('aria-valuemin', '0')
    expect(thumb()).toHaveAttribute('aria-valuemax', '2')
    expect(thumb()).toHaveAttribute('aria-valuenow', '1')
    expect(thumb()).toHaveAttribute('aria-valuetext', 'Balanced')
    expect(thumb()).toHaveAttribute('tabindex', '0')
  })

  it('shows every stop label under the track', () => {
    render(<Sl />)
    for (const s of stops) expect(screen.getByText(s.label)).toBeInTheDocument()
  })

  it('arrows step, Home/End jump, and values stay within bounds', async () => {
    const onValue = vi.fn()
    render(<Sl initial={1} onValue={onValue} />)
    thumb().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onValue).toHaveBeenLastCalledWith(2)
    onValue.mockClear()
    await userEvent.keyboard('{ArrowRight}')
    expect(onValue).not.toHaveBeenCalled()
    await userEvent.keyboard('{ArrowLeft}{ArrowDown}')
    expect(onValue).toHaveBeenLastCalledWith(0)
    await userEvent.keyboard('{End}')
    expect(onValue).toHaveBeenLastCalledWith(2)
    await userEvent.keyboard('{Home}')
    expect(onValue).toHaveBeenLastCalledWith(0)
  })

  it('without stops the value is the aria-valuetext', () => {
    render(<Sl withStops={false} initial={2} />)
    expect(thumb()).toHaveAttribute('aria-valuetext', '2')
  })

  it('pressing the track snaps to the nearest step by pointer position', () => {
    const onValue = vi.fn()
    const { container } = render(<Sl initial={0} onValue={onValue} />)
    const track = container.querySelector<HTMLElement>('.slider__track')!
    track.getBoundingClientRect = () => ({ left: 0, right: 200, width: 200, top: 0, bottom: 6, height: 6, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(track, { clientX: 105, pointerId: 1 })
    expect(onValue).toHaveBeenLastCalledWith(1)
    fireEvent.pointerDown(track, { clientX: 199, pointerId: 1 })
    expect(onValue).toHaveBeenLastCalledWith(2)
    fireEvent.pointerDown(track, { clientX: -20, pointerId: 1 })
    expect(onValue).toHaveBeenLastCalledWith(0)
  })

  it('a disabled slider ignores the keyboard', async () => {
    const onChange = vi.fn()
    render(<Slider label="Planner Style" min={0} max={2} value={1} disabled onChange={onChange} />)
    screen.getByRole('slider').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-disabled', 'true')
  })
})
