import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DateField } from './DateField'

function DateHarness(props: { initial?: string; min?: string; max?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(props.initial ?? '2026-11-10')
  return (
    <DateField label="Best before" value={value} min={props.min} max={props.max} today="2026-11-10" locale="en-GB" onChange={(v) => { setValue(v); props.onValue?.(v) }} />
  )
}
const trigger = () => screen.getByRole('button', { name: /Best before/ })
const day = (name: string) => screen.getByRole('button', { name })

describe('DateField', () => {
  it('shows the formatted date, or a placeholder when empty; not a native date input', () => {
    const { container, unmount } = render(<DateHarness />)
    expect(trigger()).toHaveTextContent('10 Nov 2026')
    expect(container.querySelector('input[type=date]')).toBeNull()
    unmount()
    render(<DateHarness initial="" />)
    expect(trigger()).toHaveTextContent('Choose a date')
  })

  it('opens a calendar dialog: month heading, Monday-first weekday headers, outside days', async () => {
    render(<DateHarness />)
    await userEvent.click(trigger())
    const calendar = screen.getByRole('dialog', { name: /Best before/ })
    expect(within(calendar).getByText('November 2026')).toBeInTheDocument()
    const headers = within(calendar).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(within(calendar).getAllByRole('row')).toHaveLength(7) // header + 6 weeks (November 2026 needs six)
    expect(day('26 October 2026')).toHaveAttribute('data-outside', 'true')
    expect(day('10 November 2026').closest('[role=gridcell]')).toHaveAttribute('aria-selected', 'true')
  })

  it('marks today with aria-current and focuses the selected day on open', async () => {
    render(<DateHarness initial="2026-11-18" />)
    await userEvent.click(trigger())
    expect(day('10 November 2026')).toHaveAttribute('aria-current', 'date')
    expect(day('18 November 2026')).toHaveFocus()
  })

  it('arrows move by day and week; Enter selects, closes and refocuses the trigger', async () => {
    const onValue = vi.fn()
    render(<DateHarness onValue={onValue} />)
    await userEvent.click(trigger())
    await userEvent.keyboard('{ArrowRight}')
    expect(day('11 November 2026')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{ArrowLeft}')
    expect(day('17 November 2026')).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(day('3 November 2026')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onValue).toHaveBeenCalledWith('2026-11-17')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveTextContent('17 Nov 2026')
  })

  it('arrow keys cross into the next month and update the heading', async () => {
    render(<DateHarness initial="2026-11-30" />)
    await userEvent.click(trigger())
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText('December 2026')).toBeInTheDocument()
    expect(day('1 December 2026')).toHaveFocus()
  })

  it('PageDown/PageUp change month; the prev/next buttons too', async () => {
    render(<DateHarness initial="2027-01-31" />)
    await userEvent.click(trigger())
    await userEvent.keyboard('{PageDown}')
    expect(screen.getByText('February 2027')).toBeInTheDocument()
    expect(day('28 February 2027')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('January 2027')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('February 2027')).toBeInTheDocument()
  })

  it('prev/next month moves the focused day too: exactly one day has tabindex 0', async () => {
    render(<DateHarness initial="2026-11-10" />)
    await userEvent.click(trigger())
    const tabbable = () => within(screen.getByRole('grid')).getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0')
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('December 2026')).toBeInTheDocument()
    expect(tabbable()).toHaveLength(1)
    expect(tabbable()[0]).toHaveAccessibleName('10 December 2026')
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(tabbable()).toHaveLength(1)
    expect(tabbable()[0]).toHaveAccessibleName('10 October 2026')
  })

  it('clicking a day selects it', async () => {
    const onValue = vi.fn()
    render(<DateHarness onValue={onValue} />)
    await userEvent.click(trigger())
    await userEvent.click(day('24 November 2026'))
    expect(onValue).toHaveBeenCalledWith('2026-11-24')
  })

  it('days outside min/max are disabled and cannot be chosen', async () => {
    const onValue = vi.fn()
    render(<DateHarness min="2026-11-12" max="2026-11-20" onValue={onValue} />)
    await userEvent.click(trigger())
    expect(day('11 November 2026')).toHaveAttribute('aria-disabled', 'true')
    expect(day('21 November 2026')).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(day('11 November 2026'))
    expect(onValue).not.toHaveBeenCalled()
    expect(day('15 November 2026')).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('Escape closes without changing the value and refocuses the trigger', async () => {
    const onValue = vi.fn()
    render(<DateHarness onValue={onValue} />)
    await userEvent.click(trigger())
    await userEvent.keyboard('{ArrowRight}{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onValue).not.toHaveBeenCalled()
    expect(trigger()).toHaveFocus()
  })
})
