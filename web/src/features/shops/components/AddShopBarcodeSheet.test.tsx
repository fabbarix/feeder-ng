import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, openOptionNames, pickOption, renderWithProviders } from '../../settings/test-utils'
import { strings } from '../strings'
import type { ShopRule } from '../types'
import { AddShopBarcodeSheet } from './AddShopBarcodeSheet'

const rule: ShopRule = { id: 4, shopId: 1, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'kg', decimalPlaces: 3 }
const rule2: ShopRule = { ...rule, id: 1, prefix: '02' }
const products = [
  { id: 7, name: 'Mutti passata', ingredientId: 3, ingredientName: 'Tomato passata', baseUnit: 'g', packSize: 700 },
]

function setup() {
  const api = mockApi({ 'GET /api/products': products, 'GET /api/products?q=mutti': products })
  const onAdd = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  renderWithProviders(<AddShopBarcodeSheet open rules={[rule, rule2]} onClose={onClose} onAdd={onAdd} />)
  return { api, onAdd, onClose }
}

afterEach(() => vi.unstubAllGlobals())

describe('AddShopBarcodeSheet', () => {
  it('uses the shared SearchField for the Product and a Select for the rule: no native search or select', async () => {
    setup()
    expect(await screen.findByRole('searchbox', { name: strings.productSearchLabel })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: strings.shopBarcodeRuleLabel })).toBeInTheDocument()
    expect(document.querySelector('select, input[type=search]')).toBeNull()
  })

  it('names rules by their prefix, never by id ("rule 1" vs "rule 21", QA)', async () => {
    setup()
    await userEvent.click(await screen.findByRole('combobox', { name: strings.shopBarcodeRuleLabel }))
    expect(openOptionNames()).toEqual([strings.shopBarcodeNoRule, 'Prefix 21', 'Prefix 02'])
  })

  it('adds a plain Shop Barcode for the chosen Product', async () => {
    const { onAdd, onClose } = setup()
    await userEvent.type(await screen.findByRole('searchbox', { name: strings.productSearchLabel }), 'mutti')
    await userEvent.click(await screen.findByRole('button', { name: 'Mutti passata' }))
    await userEvent.type(screen.getByLabelText(strings.shopBarcodeCodeLabel), 'PRIVATE-77')
    await userEvent.click(screen.getByRole('button', { name: strings.saveShopBarcode }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ productId: 7, code: 'PRIVATE-77' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('adds a weighed Shop Barcode: picking a rule swaps the code for an item code of the rule length', async () => {
    const { onAdd } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Mutti passata' }))
    await pickOption(strings.shopBarcodeRuleLabel, 'Prefix 21')
    expect(screen.queryByLabelText(strings.shopBarcodeCodeLabel)).toBeNull()
    await userEvent.type(screen.getByLabelText(strings.itemCodeLabel), '123')
    await userEvent.click(screen.getByRole('button', { name: strings.saveShopBarcode }))
    expect(await screen.findByText(strings.errItemCode(5))).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(strings.itemCodeLabel), '45')
    await userEvent.click(screen.getByRole('button', { name: strings.saveShopBarcode }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ productId: 7, ruleId: 4, itemCode: '12345' }))
  })

  it('asks for a Product first', async () => {
    const { onAdd } = setup()
    await userEvent.click(await screen.findByRole('button', { name: strings.saveShopBarcode }))
    expect(within(screen.getByRole('dialog')).getByText(strings.chooseProduct)).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
