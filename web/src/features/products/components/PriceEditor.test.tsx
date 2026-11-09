import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import type { Price, Shop } from '../types'
import { PriceEditor } from './PriceEditor'

const shops: Shop[] = [
  { id: 1, name: 'Big Mart' },
  { id: 2, name: 'Corner Market' },
]
const latest: Record<number, Price | undefined> = {
  2: { id: 9, productId: 1, shopId: 2, date: '2026-11-01', priceCents: 159, pricePerKgCents: 227, pricePerKgDerived: true },
}

function renderIt(over: Partial<ComponentProps<typeof PriceEditor>> = {}) {
  const props = {
    shops, latestByShop: latest, currency: 'USD', today: '2026-11-09',
    onSave: vi.fn().mockResolvedValue(undefined), onCancel: vi.fn(), ...over,
  }
  render(<PriceEditor {...props} />)
  return props
}

describe('PriceEditor', () => {
  it('prefills the Price from the latest one at the chosen Shop', async () => {
    const user = userEvent.setup()
    renderIt()
    await user.selectOptions(screen.getByLabelText(strings.shopLabel), 'Corner Market')
    expect(screen.getByLabelText(strings.priceLabel)).toHaveValue('1.59')
    expect(screen.getByLabelText(strings.pricePerKgLabel)).toHaveValue('')
    expect(screen.getByLabelText(strings.dateLabel)).toHaveValue('2026-11-09')
  })

  it('clears the prefill when the chosen Shop has no Price', async () => {
    const user = userEvent.setup()
    renderIt({ initialShopId: 2 })
    expect(screen.getByLabelText(strings.priceLabel)).toHaveValue('1.59')
    await user.selectOptions(screen.getByLabelText(strings.shopLabel), 'Big Mart')
    expect(screen.getByLabelText(strings.priceLabel)).toHaveValue('')
  })

  it('saves the edited Price in minor units', async () => {
    const user = userEvent.setup()
    const props = renderIt({ initialShopId: 2 })
    const price = screen.getByLabelText(strings.priceLabel)
    await user.clear(price)
    await user.type(price, '1.65')
    await user.click(screen.getByRole('button', { name: strings.savePrice }))
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith({ shopId: 2, date: '2026-11-09', priceCents: 165 }))
  })

  it('does not save without a Shop or an amount', async () => {
    const user = userEvent.setup()
    const props = renderIt()
    await user.click(screen.getByRole('button', { name: strings.savePrice }))
    expect(screen.getByText(strings.errShop)).toBeInTheDocument()
    expect(screen.getByText(strings.errAmount)).toBeInTheDocument()
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('reads amounts in the Household currency (no decimals for JPY)', async () => {
    const user = userEvent.setup()
    const props = renderIt({ currency: 'JPY', initialShopId: 1 })
    await user.type(screen.getByLabelText(strings.priceLabel), '159')
    await user.click(screen.getByRole('button', { name: strings.savePrice }))
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith({ shopId: 1, date: '2026-11-09', priceCents: 159 }))
  })

  it('cancels', async () => {
    const user = userEvent.setup()
    const props = renderIt()
    await user.click(screen.getByRole('button', { name: strings.cancel }))
    expect(props.onCancel).toHaveBeenCalled()
  })
})
