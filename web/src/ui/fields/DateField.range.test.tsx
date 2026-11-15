// PC-08 (B9-16): `DateField rangeStart` is the Away sheet's "Last day": the first day of the range is marked, the days up to the chosen
// last day are marked as in the range, and the days before the first day cannot be chosen. Nothing changes without the prop.
// Marks: data-range-start on the first day, data-in-range on the days strictly between, data-selected on the chosen day (as today).
// Names: the first day reads "<date>, first day", an in-range day "<date>, in the range" (fieldStrings.rangeFirstDay / rangeInside).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { DateField } from './DateField'

function Harness(props: { initial?: string; rangeStart?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(props.initial ?? '')
  return (
    <DateField
      label="Last day"
      value={value}
      rangeStart={props.rangeStart}
      today="2026-11-10"
      locale="en-GB"
      onChange={(v) => {
        setValue(v)
        props.onValue?.(v)
      }}
    />
  )
}
const trigger = () => screen.getByRole('button', { name: /Last day/ })
const open = async () => userEvent.click(trigger())
const cell = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`)!

describe('DateField rangeStart', () => {
  it('marks the first day, the days between, and the chosen last day', async () => {
    render(<Harness initial="2026-11-20" rangeStart="2026-11-17" />)
    await open()
    expect(cell('2026-11-17')).toHaveAttribute('data-range-start')
    expect(cell('2026-11-18')).toHaveAttribute('data-in-range')
    expect(cell('2026-11-19')).toHaveAttribute('data-in-range')
    expect(cell('2026-11-20')).toHaveAttribute('data-selected', 'true')
    expect(cell('2026-11-20')).not.toHaveAttribute('data-in-range')
    expect(cell('2026-11-21')).not.toHaveAttribute('data-in-range')
    expect(cell('2026-11-16')).not.toHaveAttribute('data-range-start')
  })

  it('gives the range days names a screen reader can use', async () => {
    render(<Harness initial="2026-11-20" rangeStart="2026-11-17" />)
    await open()
    const grid = screen.getByRole('grid')
    expect(within(grid).getByRole('button', { name: '17 November 2026, first day' })).toBe(cell('2026-11-17'))
    expect(within(grid).getByRole('button', { name: '18 November 2026, in the range' })).toBe(cell('2026-11-18'))
    expect(within(grid).getByRole('button', { name: '20 November 2026' })).toBe(cell('2026-11-20'))
    expect(within(grid).getByRole('button', { name: '25 November 2026' })).toBe(cell('2026-11-25'))
  })

  it('the days before the first day are disabled and cannot be chosen', async () => {
    const onValue = vi.fn()
    render(<Harness initial="2026-11-20" rangeStart="2026-11-17" onValue={onValue} />)
    await open()
    expect(cell('2026-11-16')).toHaveAttribute('aria-disabled', 'true')
    expect(cell('2026-11-01')).toHaveAttribute('aria-disabled', 'true')
    expect(cell('2026-11-17')).not.toHaveAttribute('aria-disabled')
    await userEvent.click(cell('2026-11-16'))
    expect(onValue).not.toHaveBeenCalled()
    expect(screen.getByRole('grid')).toBeInTheDocument() // still open
  })

  it('the first day itself can be the last day (a one-day Away)', async () => {
    const onValue = vi.fn()
    render(<Harness rangeStart="2026-11-17" onValue={onValue} />)
    await open()
    await userEvent.click(cell('2026-11-17'))
    expect(onValue).toHaveBeenCalledWith('2026-11-17')
  })

  it('with no last day yet, the calendar opens on the first day and focuses it', async () => {
    render(<Harness rangeStart="2026-12-03" />)
    await open()
    expect(screen.getByText('December 2026')).toBeInTheDocument()
    expect(cell('2026-12-03')).toHaveFocus()
    expect(cell('2026-12-03')).toHaveAttribute('data-range-start')
    expect(document.querySelectorAll('[data-in-range]')).toHaveLength(0)
  })

  it('works together with min and max (the later bound wins)', async () => {
    render(
      <DateField label="Last day" value="" rangeStart="2026-11-17" min="2026-11-19" max="2026-11-25" today="2026-11-10" locale="en-GB" onChange={() => {}} />,
    )
    await open()
    expect(cell('2026-11-18')).toHaveAttribute('aria-disabled', 'true')
    expect(cell('2026-11-19')).not.toHaveAttribute('aria-disabled')
    expect(cell('2026-11-26')).toHaveAttribute('aria-disabled', 'true')
  })

  it('a value before the first day marks no range', async () => {
    render(<Harness initial="2026-11-12" rangeStart="2026-11-17" />)
    await open()
    expect(document.querySelectorAll('[data-in-range]')).toHaveLength(0)
  })

  it('arrow keys still move the day, Enter chooses it', async () => {
    const onValue = vi.fn()
    render(<Harness initial="2026-11-20" rangeStart="2026-11-17" onValue={onValue} />)
    await open()
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(onValue).toHaveBeenCalledWith('2026-11-21')
  })

  it('without rangeStart nothing is marked and the day names are the plain dates', async () => {
    render(<Harness initial="2026-11-20" />)
    await open()
    expect(document.querySelector('[data-range-start]')).toBeNull()
    expect(document.querySelector('[data-in-range]')).toBeNull()
    expect(screen.getByRole('button', { name: '18 November 2026' })).toBeInTheDocument()
  })
})

describe('DateField.css range marks (mock pc-08-away-calendar.html)', () => {
  const css = readUiCss('fields/DateField.css')
  it('an in-range day is the soft container with square corners, so the days read as one band', () => {
    const d = declarations(css, ".date-field__grid button[data-in-range]")
    expect(d['background']).toBe('var(--color-soft)')
    expect(d['color']).toBe('var(--color-accent-text)')
    expect(d['border-radius']).toBe('0')
  })
  it('the first day is the accent fill with on-accent text, like the chosen day', () => {
    const d = declarations(css, ".date-field__grid button[data-range-start]")
    expect(d['background']).toBe('var(--color-accent)')
    expect(d['color']).toBe('var(--color-on-accent)')
  })
})
