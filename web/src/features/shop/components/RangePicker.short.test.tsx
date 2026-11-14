import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RangePicker } from './RangePicker'

// b8-shop: below 420 px the chip keeps its calendar icon and shows the short value; the list shows the full labels.
function viewport(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /min-width:\s*420px/.test(query) ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}
afterEach(() => vi.unstubAllGlobals())

const props = { today: '2026-11-09', maxTo: '2026-11-22', to: '2026-11-20', onChange: () => {} }

describe('RangePicker at a narrow width', () => {
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
    expect(within(screen.getByRole('dialog')).getByRole('option', { name: 'Until tomorrow' })).toBeInTheDocument()
  })

  it('"Today" and "Tomorrow" show as they are', () => {
    viewport(false)
    const { rerender } = render(<RangePicker {...props} to="2026-11-10" />)
    expect(screen.getByRole('combobox', { name: /Shop for/ })).toHaveTextContent(/^Tomorrow$/)
    rerender(<RangePicker {...props} to="2026-11-09" />)
    expect(screen.getByRole('combobox', { name: /Shop for/ })).toHaveTextContent(/^Today$/)
  })
})

describe('RangePicker at 420 px and wider', () => {
  it('shows the full "Until Fri 20" and sets no title', () => {
    viewport(true)
    render(<RangePicker {...props} />)
    const trigger = screen.getByRole('combobox', { name: /Shop for/ })
    expect(trigger).toHaveTextContent('Until Fri 20')
    expect(trigger).not.toHaveAttribute('title')
  })
})
