import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RangePicker } from './RangePicker'

// b8-shop, B9-15: when the chip's own row has no room for "Until Fri 20" the chip keeps its calendar icon and shows the short value
// (the chip Select's shortLabel; no window query). The list shows the full labels. The row's room is stood in for here.
const room: { fit: { natural: number; room: number } | null } = { fit: null }
vi.mock('../../../ui/Select/chipFit', async (orig) => ({ ...(await orig<typeof import('../../../ui/Select/chipFit')>()), measureChipFit: () => room.fit }))
function viewport(wide: boolean) {
  room.fit = wide ? { natural: 150, room: 300 } : { natural: 150, room: 120 }
}
beforeEach(() => {
  room.fit = null
})

const props = { today: '2026-11-09', maxTo: '2026-11-22', to: '2026-11-20', onChange: () => {} }

describe('RangePicker when its row has no room for the full value', () => {
  it('shows "Fri 20", keeps the icon, and is still named "Shop for"', () => {
    viewport(false)
    render(<RangePicker {...props} />)
    const trigger = screen.getByRole('combobox', { name: /Shop for/ })
    expect(trigger).toHaveTextContent('Fri 20')
    expect(trigger).not.toHaveTextContent('Until')
    expect(trigger.querySelector('.select__leading svg')).toBeInTheDocument()
  })

  it('keeps the full value reachable as the title', () => {
    viewport(false)
    render(<RangePicker {...props} />)
    expect(screen.getByRole('combobox', { name: /Shop for/ })).toHaveAttribute('title', 'Until Fri 20')
  })

  it('the list still offers the full labels', async () => {
    viewport(false)
    render(<RangePicker {...props} />)
    await userEvent.click(screen.getByRole('combobox', { name: /Shop for/ }))
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'Until tomorrow' })).toBeInTheDocument()
  })

  it('"Today" and "Tomorrow" show as they are', () => {
    viewport(false)
    const { rerender } = render(<RangePicker {...props} to="2026-11-10" />)
    expect(screen.getByRole('combobox', { name: /Shop for/ })).toHaveTextContent(/^Tomorrow$/)
    rerender(<RangePicker {...props} to="2026-11-09" />)
    expect(screen.getByRole('combobox', { name: /Shop for/ })).toHaveTextContent(/^Today$/)
  })
})

describe('RangePicker with room for the full value', () => {
  it('shows the full "Until Fri 20" and sets no title', () => {
    viewport(true)
    render(<RangePicker {...props} />)
    const trigger = screen.getByRole('combobox', { name: /Shop for/ })
    expect(trigger).toHaveTextContent('Until Fri 20')
    expect(trigger).not.toHaveAttribute('title')
  })
})
