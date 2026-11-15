// B9-30 (SAFE-04): the Add Price sheet reports its errors at the field and focuses the first invalid one; a server failure is a
// FormError (role=alert, class form-error). Cancel and Save Price stay its footer (B9-14), with no Close.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { PriceEditor } from './PriceEditor'

const shops = [{ id: 1, name: 'Big Mart' }, { id: 2, name: 'Coop' }]
const setup = (onSave = vi.fn().mockResolvedValue(undefined), initialShopId?: number) =>
  render(<PriceEditor shops={shops} latestByShop={{}} currency="USD" today="2026-11-14" initialShopId={initialShopId} onSave={onSave} onCancel={vi.fn()} />)

describe('PriceEditor errors', () => {
  it('Save with no Shop marks the Shop invalid, focuses it and says why under it; nothing is saved', async () => {
    const onSave = vi.fn()
    setup(onSave)
    await userEvent.click(screen.getByRole('button', { name: strings.savePrice }))
    const shop = screen.getByRole('combobox', { name: strings.shopLabel })
    expect(shop).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(shop).toHaveFocus())
    expect(within(screen.getByRole('dialog')).getByText(strings.errShop)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('with a Shop and no amount the Price field is the first invalid one', async () => {
    setup(undefined, 1)
    await userEvent.click(screen.getByRole('button', { name: strings.savePrice }))
    const price = screen.getByLabelText(strings.priceLabel)
    expect(price).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(price).toHaveFocus())
    expect(screen.getByText(strings.errAmount)).toBeInTheDocument()
  })

  it('a server failure is a FormError', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Prices are closed for that day.')), 1)
    await userEvent.type(screen.getByLabelText(strings.priceLabel), '1.59')
    await userEvent.click(screen.getByRole('button', { name: strings.savePrice }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('form-error')
    expect(alert).toHaveTextContent('Prices are closed for that day.')
  })

  it('the footer is Cancel and Save Price with no Close', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /^close$/i })).toBeNull()
    expect(within(dialog).getByRole('button', { name: strings.cancel })).toHaveAttribute('data-variant', 'secondary')
    expect(within(dialog).getByRole('button', { name: strings.savePrice })).toHaveAttribute('type', 'submit')
  })
})
