import { fireEvent, render, screen } from '@testing-library/react'
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
// Segments may be spans (text) or text inputs (value): read what is shown either way.
const shown = (el: HTMLElement) => (el instanceof HTMLInputElement ? el.value : (el.textContent ?? ''))

describe('TimeField (24 h)', () => {
  it('is a group with Hour and Minute spinbuttons showing 19 and 30', () => {
    render(<Time />)
    expect(screen.getByRole('group', { name: 'Start time' })).toBeInTheDocument()
    expect(shown(hour())).toBe('19')
    expect(shown(minute())).toBe('30')
    expect(hour()).toHaveAttribute('aria-valuemin', '0')
    expect(hour()).toHaveAttribute('aria-valuemax', '23')
    expect(minute()).toHaveAttribute('aria-valuemax', '59')
  })

  it('never shows AM/PM and is not a native time input', () => {
    const { container } = render(<Time initial="07:05" />)
    expect(container).not.toHaveTextContent(/AM|PM/i)
    expect(container.querySelector('input[type=time]')).toBeNull()
    expect(shown(hour())).toBe('07')
    expect(shown(minute())).toBe('05')
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
    expect(shown(hour())).toBe('––')
    expect(shown(minute())).toBe('––')
  })

  // Touch path (plan 4.10 "never the browser's AM/PM" + phones need a keyboard): each segment is a text input with
  // inputmode="numeric" keeping spinbutton semantics (24 h, no native time input). Chosen over per-segment steppers:
  // fewer controls, the same digit rules as the hardware keyboard, and a numeric keypad is the fastest way to type 19:45.
  describe('touch path', () => {
    it('segments are text inputs with inputmode numeric and spinbutton semantics', () => {
      render(<Time />)
      for (const seg of [hour(), minute()]) {
        expect(seg.tagName).toBe('INPUT')
        expect(seg).toHaveAttribute('type', 'text')
        expect(seg).toHaveAttribute('inputmode', 'numeric')
        expect(seg).toHaveAttribute('role', 'spinbutton')
      }
      expect(hour()).toHaveValue('19')
    })

    it('a value entered by an on-screen keyboard (input event) updates the value', () => {
      const onValue = vi.fn()
      render(<Time initial="" onValue={onValue} />)
      fireEvent.change(hour(), { target: { value: '19' } })
      expect(onValue).toHaveBeenLastCalledWith('19:00')
      fireEvent.change(minute(), { target: { value: '45' } })
      expect(onValue).toHaveBeenLastCalledWith('19:45')
    })

    it('typed digits through the input path pad, clamp and ignore non-digits', () => {
      const onValue = vi.fn()
      render(<Time initial="" onValue={onValue} />)
      fireEvent.change(hour(), { target: { value: '7' } })
      expect(onValue).toHaveBeenLastCalledWith('07:00')
      fireEvent.change(hour(), { target: { value: '25' } })
      expect(onValue).toHaveBeenLastCalledWith('23:00')
      onValue.mockClear()
      fireEvent.change(minute(), { target: { value: 'ab' } })
      expect(onValue).not.toHaveBeenCalled()
    })
    it('sequential keypad digits: "1" then "4" on a segment already holding the padded "01" gives 14', () => {
      const onValue = vi.fn()
      render(<Time initial="" onValue={onValue} />)
      fireEvent.change(hour(), { target: { value: '1' } })
      expect(onValue).toHaveBeenLastCalledWith('01:00')
      expect(hour()).toHaveValue('01')
      // Second digit: the browser appends to the displayed "01", so the input now holds "014".
      fireEvent.change(hour(), { target: { value: '014' } })
      expect(onValue).toHaveBeenLastCalledWith('14:00')
      expect(hour()).toHaveValue('14')
    })

    it('segments allow a third character, so an appended keypad digit is not truncated by the browser', () => {
      render(<Time />)
      for (const seg of [hour(), minute()]) {
        const max = seg.getAttribute('maxlength')
        expect(max === null || Number(max) >= 3).toBe(true)
      }
    })
  })
})
