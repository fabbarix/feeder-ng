// B9-15: container-driven fitting of a chip Select's value (replaces features/shop/lib/narrowChips.ts, a 26.25 em window query).
// An option may carry a `shortLabel`: a chip shows it only when its container has no room for the label. The window width plays no part.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Select } from './Select'
import { ShopSelect } from './ShopSelect'

const state: { fit: { natural: number; room: number } | null } = { fit: null }
vi.mock('./chipFit', async (orig) => ({ ...(await orig<typeof import('./chipFit')>()), measureChipFit: () => state.fit }))

const options = [
  { value: 'a', label: 'Until Fri 20', shortLabel: 'Fri 20' },
  { value: 'b', label: 'Today' },
]
const chip = (props: Record<string, unknown> = {}) => <Select label="Shop for" appearance="chip" icon="plan" options={options} value="a" onChange={() => {}} {...props} />

beforeEach(() => {
  state.fit = null
})

describe('Select chip with a shortLabel', () => {
  it('unmeasured (jsdom, or before layout) shows the label in full', () => {
    render(chip())
    expect(screen.getByRole('combobox', { name: 'Shop for' })).toHaveTextContent('Until Fri 20')
  })
  it('with room for the label it shows the label', () => {
    state.fit = { natural: 150, room: 150 }
    render(chip())
    const trigger = screen.getByRole('combobox', { name: 'Shop for' })
    expect(trigger).toHaveTextContent('Until Fri 20')
    expect(trigger).not.toHaveAttribute('title')
  })
  it('with no room (1 px short) it shows the short value, the full label as its title, the name still the label', () => {
    state.fit = { natural: 151, room: 150 }
    render(chip())
    const trigger = screen.getByRole('combobox', { name: 'Shop for' })
    expect(trigger).toHaveTextContent(/^Fri 20$/)
    expect(trigger).toHaveAttribute('title', 'Until Fri 20')
  })
  it('the open list always shows the full label', async () => {
    state.fit = { natural: 400, room: 100 }
    render(chip())
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByRole('option', { name: 'Until Fri 20' })).toBeInTheDocument()
  })
  it('an option with no shortLabel is shown in full whatever the room', () => {
    state.fit = { natural: 400, room: 100 }
    render(chip({ value: 'b' }))
    expect(screen.getByRole('combobox', { name: 'Shop for' })).toHaveTextContent(/^Today$/)
  })
  it('a hidden measuring copy of the full label exists only when the chosen option has a shortLabel', () => {
    const { container, rerender } = render(chip())
    const copy = container.querySelector('.select__measure')
    expect(copy).toHaveTextContent('Until Fri 20')
    expect(copy).toHaveAttribute('aria-hidden', 'true')
    rerender(chip({ value: 'b' }))
    expect(container.querySelector('.select__measure')).toBeNull()
  })
  it('a field (not a chip) never shortens', () => {
    state.fit = { natural: 400, room: 100 }
    render(chip({ appearance: undefined }))
    expect(screen.getByRole('combobox', { name: 'Shop for' })).toHaveTextContent('Until Fri 20')
  })
})

describe('ShopSelect shortName', () => {
  const shops = [{ id: 0, name: 'Any Shop', shortName: 'Any' }, { id: 1, name: 'Coop' }]
  it('is the chip\'s shortLabel: the Shop name shows while it fits, the short name when it does not (no window query)', () => {
    state.fit = { natural: 90, room: 90 }
    const { rerender } = render(<ShopSelect label="Shop" appearance="chip" icon="shops" shops={shops} value={0} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Shop' })).toHaveTextContent(/^Any Shop$/)
    state.fit = { natural: 90, room: 60 }
    rerender(<ShopSelect label="Shop" appearance="chip" icon="shops" shops={[...shops]} value={0} onChange={() => {}} />)
    const trigger = screen.getByRole('combobox', { name: 'Shop' })
    expect(trigger).toHaveTextContent(/^Any$/)
    expect(trigger).toHaveAttribute('title', 'Any Shop')
  })
})
