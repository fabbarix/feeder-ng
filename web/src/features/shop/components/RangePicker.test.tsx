import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RangePicker } from './RangePicker'

describe('RangePicker (a Select, not seven chips)', () => {
  it('is one combobox named "Shop for" that shows the range in use', () => {
    const { container } = render(<RangePicker today="2026-11-09" maxTo="2026-11-15" to="2026-11-12" onChange={() => {}} />)
    const trigger = screen.getByRole('combobox', { name: /Shop for/ })
    expect(trigger).toHaveTextContent('Until Thu 12')
    expect(container.querySelectorAll('.chip')).toHaveLength(0)
  })

  it('round 2: it is a compact chip picker with a calendar icon and a visually hidden "Shop for" label', () => {
    const { container } = render(<RangePicker today="2026-11-09" maxTo="2026-11-15" to="2026-11-12" onChange={() => {}} />)
    const trigger = screen.getByRole('combobox', { name: /Shop for/ })
    expect(trigger).toHaveAttribute('data-appearance', 'chip')
    expect(trigger.querySelector('.select__leading svg')).toBeInTheDocument()
    expect(container.querySelector('.ui-field__label')).toHaveClass('visually-hidden')
  })

  it('lists a day per option up to the horizon and chooses another last date', async () => {
    const onChange = vi.fn()
    render(<RangePicker today="2026-11-09" maxTo="2026-11-15" to="2026-11-15" onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: /Shop for/ }))
    const list = screen.getByRole('listbox')
    expect(within(list).getAllByRole('option')).toHaveLength(7)
    expect(within(list).getByRole('option', { name: 'Today' })).toBeInTheDocument()
    await userEvent.click(within(list).getByRole('option', { name: 'Until tomorrow' }))
    expect(onChange).toHaveBeenCalledWith('2026-11-10')
  })
})
