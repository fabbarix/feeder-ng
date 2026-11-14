// H9: the "how much" sheet for a g or ml Supply (household-items.md section 4.11). Pinned props:
//   <UseSupplySheet supply stock packSize packLoading? system busy? onConfirm onClose />
//   A BottomSheet titled "Use <Name>", a NumberField "How much" with the Base Unit, prefilled by sheetStart(packSize, stock), and
//   two buttons: "Use" (checks the amount: checkUseAmount, then onConfirm(amount)) and "Use all" (onConfirm(stock) at once).
//   A refused amount shows its error under the field (role alert) and calls nothing. Close, Escape and the backdrop call onClose.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { dishSoapJSON } from '../supply.test-helper'
import { UseSupplySheet } from './UseSupplySheet'

function setup(over: Partial<React.ComponentProps<typeof UseSupplySheet>> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(<UseSupplySheet supply={dishSoapJSON} stock={800} packSize={500} system="metric" onConfirm={onConfirm} onClose={onClose} {...over} />)
  return { onConfirm, onClose }
}
const field = () => screen.getByRole('textbox', { name: 'How much' })

describe('UseSupplySheet', () => {
  it('is a dialog named "Use Dish soap" asking "How much" in ml', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Use Dish soap' })).toBeInTheDocument()
    expect(field()).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('ml')
  })
  it('beta.7 (page-layout guard P4): the amount is a short field (size sm), not a 320 px one, in the centred sheet from 768 px', () => {
    setup()
    expect(field().closest('[data-size]')).toHaveAttribute('data-size', 'sm')
  })
  it('is prefilled with the pack size of the Product last bought', () => {
    setup({ packSize: 500 })
    expect(field()).toHaveValue('500')
  })
  it('is prefilled with no more than is in Stock', () => {
    setup({ packSize: 500, stock: 300 })
    expect(field()).toHaveValue('300')
  })
  it('is empty when no pack size is known', () => {
    setup({ packSize: null })
    expect(field()).toHaveValue('')
  })
  it('puts the cursor in the amount when it opens', () => {
    setup()
    expect(field()).toHaveFocus()
  })
  it('uses the prefilled amount with "Use"', async () => {
    const { onConfirm } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(onConfirm).toHaveBeenCalledWith(500)
  })
  it('uses what was typed, with a decimal comma', async () => {
    const { onConfirm } = setup()
    await userEvent.clear(field())
    await userEvent.type(field(), '125,5')
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(onConfirm).toHaveBeenCalledWith(125.5)
  })
  it('"Use all" uses the whole Stock at once', async () => {
    const { onConfirm } = setup({ stock: 800 })
    await userEvent.click(screen.getByRole('button', { name: 'Use all' }))
    expect(onConfirm).toHaveBeenCalledWith(800)
  })
  it('refuses more than is in Stock and says how much there is', async () => {
    const { onConfirm } = setup({ stock: 300, packSize: null })
    await userEvent.type(field(), '400')
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Only 300 ml in Stock')
  })
  it('asks for an amount when the field is empty, and refuses 0', async () => {
    const { onConfirm } = setup({ packSize: null })
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter how much you used')
    await userEvent.type(field(), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use more than 0')
    expect(onConfirm).not.toHaveBeenCalled()
  })
  it('disables both buttons while busy', () => {
    setup({ busy: true })
    expect(screen.getByRole('button', { name: 'Use' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use all' })).toBeDisabled()
  })
  it('closes with Close and with Escape, without using anything', async () => {
    const { onClose, onConfirm } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
