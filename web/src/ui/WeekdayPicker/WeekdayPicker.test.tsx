import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WeekdayPicker } from './WeekdayPicker'

const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const group = () => screen.getByRole('group', { name: 'Apply to' })
const chips = () => within(group()).getAllByRole('button')

function setup(over: Partial<React.ComponentProps<typeof WeekdayPicker>> = {}) {
  const onChange = vi.fn()
  render(<WeekdayPicker label="Apply to" value={[2]} onChange={onChange} {...over} />)
  return onChange
}

describe('WeekdayPicker (R15: seven toggle chips, no dropdown)', () => {
  it('is a labelled group of seven toggle buttons, Monday first, with the full name as accessible name', () => {
    setup()
    expect(chips().map((c) => c.getAttribute('aria-label'))).toEqual(FULL)
    expect(chips().map((c) => c.textContent?.replace(/\s/g, ''))).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(document.querySelector('select')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows the selection with aria-pressed and a check glyph, so colour is never the only cue', () => {
    setup({ value: [2, 4] })
    expect(chips().map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'true', 'false', 'false', 'false'])
    expect(chips()[1]!.querySelector('svg')).not.toBeNull()
    expect(chips()[0]!.querySelector('svg')).toBeNull()
  })

  it('toggles a weekday on click and reports ascending ISO order', async () => {
    const onChange = setup({ value: [5] })
    await userEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(onChange).toHaveBeenLastCalledWith([1, 5])
    await userEvent.click(screen.getByRole('button', { name: 'Friday' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('works from the keyboard: Tab reaches every chip, Space and Enter toggle', async () => {
    const onChange = setup({ value: [] })
    await userEvent.tab()
    expect(chips()[0]).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith([1])
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith([2])
  })

  it('arrow keys, Home and End move focus between chips (wrapping) without changing the selection', async () => {
    const onChange = setup({ value: [] })
    chips()[0]!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(chips()[1]).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(chips()[6]).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(chips()[0]).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(chips()[6]).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('weekStart 7 puts Sunday first and still reports ISO order', async () => {
    const onChange = setup({ weekStart: 7, value: [] })
    expect(chips().map((c) => c.getAttribute('aria-label'))[0]).toBe('Sunday')
    await userEvent.click(chips()[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Tuesday' }))
    expect(onChange).toHaveBeenLastCalledWith([2])
  })

  it('uses the locale for the visible and accessible names', () => {
    setup({ locale: 'it' })
    expect(chips()[0]!.getAttribute('aria-label')?.toLowerCase()).toBe('lunedì')
    expect(chips()[0]!.textContent?.toLowerCase()).toContain('lun')
  })

  it('disabled chips do nothing', async () => {
    const onChange = setup({ disabled: true })
    chips().forEach((c) => expect(c).toBeDisabled())
    await userEvent.click(chips()[0]!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows helper and error text tied to the group; the error is an alert', () => {
    setup({ helper: 'Pick days', error: 'Choose at least one weekday.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one weekday.')
    expect(screen.getByText('Pick days')).toBeInTheDocument()
    expect(group().getAttribute('aria-describedby')).toBeTruthy()
  })
})
