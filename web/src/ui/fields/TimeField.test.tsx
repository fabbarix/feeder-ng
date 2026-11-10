import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TimeField } from './TimeField'

function Time(props: { initial?: string; minuteStep?: number; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(props.initial ?? '19:30')
  return <TimeField label="Start time" value={value} minuteStep={props.minuteStep} onChange={(v) => { setValue(v); props.onValue?.(v) }} />
}
const hour = () => screen.getByRole('spinbutton', { name: 'Hour' })
const minute = () => screen.getByRole('spinbutton', { name: 'Minute' })

describe('TimeField (24 h)', () => {
  it('is a group with Hour and Minute spinbuttons showing 19 and 30', () => {
    render(<Time />)
    expect(screen.getByRole('group', { name: 'Start time' })).toBeInTheDocument()
    expect(hour()).toHaveTextContent('19')
    expect(minute()).toHaveTextContent('30')
    expect(hour()).toHaveAttribute('aria-valuemin', '0')
    expect(hour()).toHaveAttribute('aria-valuemax', '23')
    expect(minute()).toHaveAttribute('aria-valuemax', '59')
  })

  it('never shows AM/PM and is not a native time input', () => {
    const { container } = render(<Time initial="07:05" />)
    expect(container).not.toHaveTextContent(/AM|PM/i)
    expect(container.querySelector('input[type=time]')).toBeNull()
    expect(hour()).toHaveTextContent('07')
    expect(minute()).toHaveTextContent('05')
  })

  it('arrows step the focused segment, wrapping without carry', async () => {
    const onValue = vi.fn()
    render(<Time initial="23:00" onValue={onValue} />)
    hour().focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onValue).toHaveBeenLastCalledWith('00:00')
    minute().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onValue).toHaveBeenLastCalledWith('00:59')
  })

  it('honours minuteStep', async () => {
    const onValue = vi.fn()
    render(<Time initial="19:30" minuteStep={5} onValue={onValue} />)
    minute().focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onValue).toHaveBeenLastCalledWith('19:35')
  })

  it('typing two digits sets the hour and moves on to the minute', async () => {
    const onValue = vi.fn()
    render(<Time initial="" onValue={onValue} />)
    hour().focus()
    await userEvent.keyboard('19')
    expect(onValue).toHaveBeenLastCalledWith('19:00')
    expect(minute()).toHaveFocus()
    await userEvent.keyboard('45')
    expect(onValue).toHaveBeenLastCalledWith('19:45')
  })

  it('a first digit that cannot start an hour pads and advances (7 -> 07)', async () => {
    const onValue = vi.fn()
    render(<Time initial="" onValue={onValue} />)
    hour().focus()
    await userEvent.keyboard('7')
    expect(onValue).toHaveBeenLastCalledWith('07:00')
    expect(minute()).toHaveFocus()
  })

  it('an hour above 23 clamps to 23', async () => {
    const onValue = vi.fn()
    render(<Time initial="" onValue={onValue} />)
    hour().focus()
    await userEvent.keyboard('25')
    expect(onValue).toHaveBeenLastCalledWith('23:00')
  })

  it('shows placeholders for an empty value', () => {
    render(<Time initial="" />)
    expect(hour()).toHaveTextContent('––')
    expect(minute()).toHaveTextContent('––')
  })
})
