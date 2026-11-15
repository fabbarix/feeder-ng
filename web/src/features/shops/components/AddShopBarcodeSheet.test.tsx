// B9-30 (SET-01, SAFE-04, SHORT-02): the Add Shop Barcode sheet is rebuilt on the crafted Product Select.
// API pinned (features/shops/components/AddShopBarcodeSheet.tsx):
//   <AddShopBarcodeSheet open shop={{id,name}} rules currency? soldAtProductIds?: number[] onClose onAdd />
//   - Products are the Product list's (`useProducts('')`); whether one is a Supply comes from its Ingredient's kind (GET /api/ingredients, tolerated
//     when it fails), "sold at" from `soldAtProductIds` (the Shop page passes the Products it has a Price or a Shop Barcode for);
//   - Product: the crafted ProductSelect (combobox "Product"), every Product from GET /api/products, "Sold at <Shop>" from soldAtProductIds;
//     no SearchField, no Chip row, no "Search Products" hint;
//   - Weight Barcode Rule: a Select shown only when the Shop has rules; first option "No rule: a plain code";
//   - Code ("Item code" with a rule): a full-width TextField with the helper "The code printed on the Shop's own label.";
//   - the footer has an outline Cancel and the primary "Save Shop Barcode" (submit bound to the form); so the sheet has NO Close;
//   - validation at the field: Save with a missing Product or code marks that field aria-invalid, focuses the first one, and shows the
//     message under it; a rejection of onAdd is the Code field's error; the sheet raises no role="alert" of its own (SAFE-04).
// New strings (features/shops/strings.ts): shopBarcodeCodeLabel 'Code', shopBarcodeRuleLabel 'Weight Barcode Rule',
//   shopBarcodeNoRule 'No rule: a plain code', shopBarcodeCodeHelper "The code printed on the Shop's own label.",
//   noProductToChoose 'No Product to choose. Add one from an Ingredient or a scan.', productsLink 'Products'.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, openOptionNames, pickOption, renderWithProviders } from '../../settings/test-utils'
import { strings } from '../strings'
import type { ShopRule } from '../types'
import { AddShopBarcodeSheet } from './AddShopBarcodeSheet'

const rule: ShopRule = { id: 4, shopId: 1, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'kg', decimalPlaces: 3 }
const rule2: ShopRule = { ...rule, id: 1, prefix: '02' }
const product = (id: number, name: string, extra: Record<string, unknown> = {}) => ({ id, name, ingredientId: 3, ingredientName: 'Tomato passata', baseUnit: 'g', packSize: 700, ...extra })
const products = [product(7, 'Mutti passata')]
const thirteen = Array.from({ length: 13 }, (_, i) => product(i + 1, `Product ${String(i + 1).padStart(2, '0')}`))
const shop = { id: 1, name: 'Coop' }

function setup(over: { rules?: ShopRule[]; list?: unknown[]; soldAt?: number[]; onAdd?: (b: unknown) => Promise<void> } = {}) {
  const api = mockApi({ 'GET /api/products': over.list ?? products, 'GET /api/ingredients': [] })
  const onAdd = vi.fn(over.onAdd ?? (() => Promise.resolve()))
  const onClose = vi.fn()
  renderWithProviders(<AddShopBarcodeSheet open shop={shop} rules={over.rules ?? [rule, rule2]} soldAtProductIds={over.soldAt} onClose={onClose} onAdd={onAdd} />)
  return { api, onAdd, onClose }
}
const dialog = () => screen.getByRole('dialog', { name: strings.addShopBarcode })
const choose = async (name: RegExp | string) => {
  await userEvent.click(await screen.findByRole('combobox', { name: strings.productSearchLabel }))
  await userEvent.click(await screen.findByRole('option', { name }))
}

afterEach(() => vi.unstubAllGlobals())

describe('the copy', () => {
  it('is the chapter\'s', () => {
    expect(strings.shopBarcodeCodeLabel).toBe('Code')
    expect(strings.shopBarcodeRuleLabel).toBe('Weight Barcode Rule')
    expect(strings.shopBarcodeNoRule).toBe('No rule: a plain code')
    expect(strings.shopBarcodeCodeHelper).toBe("The code printed on the Shop's own label.")
    expect(strings.itemCodeLabel).toBe('Item code')
    expect(strings.noProductToChoose).toBe('No Product to choose. Add one from an Ingredient or a scan.')
  })
})

describe('AddShopBarcodeSheet: the crafted Product Select (SET-01)', () => {
  it('has a Product combobox and no SearchField, no filter Chips and no "Search Products" hint', async () => {
    setup()
    expect(await screen.findByRole('combobox', { name: strings.productSearchLabel })).toBeInTheDocument()
    const d = dialog()
    expect(within(d).queryByRole('searchbox')).toBeNull()
    expect(d.querySelector('.chip')).toBeNull()
    expect(within(d).queryByText(strings.productPickerHint)).toBeNull()
    expect(d.querySelector('select, input[type=search]')).toBeNull()
  })

  it('opens with focus on the Product combobox, so nothing scrolls sideways', async () => {
    setup()
    const combobox = await screen.findByRole('combobox', { name: strings.productSearchLabel })
    await waitFor(() => expect(combobox).toHaveFocus())
  })

  it('has no Close: the footer has Cancel (R-B), and Save Shop Barcode is the primary beside it', async () => {
    const { onClose } = setup()
    await screen.findByRole('combobox', { name: strings.productSearchLabel })
    const d = dialog()
    expect(within(d).queryByRole('button', { name: /^close$/i })).toBeNull()
    const cancel = within(d).getByRole('button', { name: strings.cancel })
    expect(cancel).toHaveAttribute('data-variant', 'secondary')
    expect(within(d).getByRole('button', { name: strings.saveShopBarcode })).toHaveAttribute('type', 'submit')
    await userEvent.click(cancel)
    expect(onClose).toHaveBeenCalled()
  })

  it('Add a Shop Barcode for a Product beyond the first twelve', async () => {
    const { onAdd, onClose } = setup({ list: thirteen })
    await userEvent.click(await screen.findByRole('combobox', { name: strings.productSearchLabel }))
    await userEvent.type(await screen.findByRole('searchbox'), 'Product 13')
    await userEvent.click(await screen.findByRole('option', { name: /Product 13/ }))
    await userEvent.type(screen.getByLabelText(strings.shopBarcodeCodeLabel), 'PRIVATE-77')
    await userEvent.click(screen.getByRole('button', { name: strings.saveShopBarcode }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ productId: 13, code: 'PRIVATE-77' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('offers "Sold at Coop" first among the Products', async () => {
    setup({ list: [product(1, 'Apple jam'), product(2, 'Butter')], soldAt: [2] })
    await userEvent.click(await screen.findByRole('combobox', { name: strings.productSearchLabel }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)[0]).toContain('Butter')
    expect(screen.getByRole('listbox')).toHaveTextContent('Sold at Coop')
  })

  it('without a Product to choose it says so and links to the Products', async () => {
    setup({ list: [] })
    expect(await screen.findByText(strings.noProductToChoose)).toBeInTheDocument()
    expect(within(dialog()).getByRole('link', { name: 'Products' })).toHaveAttribute('href', '/products')
  })
})

describe('AddShopBarcodeSheet: rule and code', () => {
  it('shows the rule Select only when the Shop has rules; the first option is "No rule: a plain code"; options are named by prefix', async () => {
    setup()
    await userEvent.click(await screen.findByRole('combobox', { name: strings.shopBarcodeRuleLabel }))
    expect(openOptionNames()).toEqual([strings.shopBarcodeNoRule, 'Prefix 21', 'Prefix 02'])
  })

  it('has no rule Select for a Shop without rules', async () => {
    setup({ rules: [] })
    await screen.findByRole('combobox', { name: strings.productSearchLabel })
    expect(screen.queryByRole('combobox', { name: strings.shopBarcodeRuleLabel })).toBeNull()
  })

  it('the Code field says what the code is, and is full width', async () => {
    setup()
    const code = await screen.findByLabelText(strings.shopBarcodeCodeLabel)
    expect(screen.getByText(strings.shopBarcodeCodeHelper)).toBeInTheDocument()
    expect(code.closest('.ui-field')).not.toHaveAttribute('data-size', 'xs')
  })

  it('picking a rule swaps Code for the Item code of the rule length, and saves a weighed Shop Barcode', async () => {
    const { onAdd } = setup()
    await choose(/Mutti passata/)
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
})

describe('AddShopBarcodeSheet: errors at the field (SAFE-04)', () => {
  it('Save with nothing chosen marks Product invalid, focuses it and explains under it; Save stays enabled', async () => {
    const { onAdd } = setup()
    const save = await screen.findByRole('button', { name: strings.saveShopBarcode })
    expect(save).toBeEnabled()
    await userEvent.click(save)
    const product = screen.getByRole('combobox', { name: strings.productSearchLabel })
    expect(product).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(product).toHaveFocus())
    const message = within(dialog()).getByText(strings.chooseProduct)
    expect(product.getAttribute('aria-describedby') ?? '').toContain(message.id)
    expect(within(dialog()).queryByRole('alert')).toBeNull()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('a missing code is the Code field\'s error, and the focus goes to it when Product is fine', async () => {
    setup()
    await choose(/Mutti passata/)
    await userEvent.click(screen.getByRole('button', { name: strings.saveShopBarcode }))
    const code = screen.getByLabelText(strings.shopBarcodeCodeLabel)
    expect(code).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(code).toHaveFocus())
    expect(within(dialog()).getByText(strings.errBarcode)).toBeInTheDocument()
  })

  it('a rejection from the server is the Code field\'s error, not a loose alert', async () => {
    const { onClose } = setup({ onAdd: () => Promise.reject(new Error('That code already belongs to Butter at this Shop.')) })
    await choose(/Mutti passata/)
    await userEvent.type(screen.getByLabelText(strings.shopBarcodeCodeLabel), 'PRIVATE-77')
    await userEvent.click(screen.getByRole('button', { name: strings.saveShopBarcode }))
    const code = screen.getByLabelText(strings.shopBarcodeCodeLabel)
    expect(await within(dialog()).findByText('That code already belongs to Butter at this Shop.')).toBeInTheDocument()
    expect(code).toHaveAttribute('aria-invalid', 'true')
    expect(dialog().querySelector('.pg__error')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})
