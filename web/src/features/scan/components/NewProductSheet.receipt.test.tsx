// B9-50 (SSP-08): the sheet of the review's Add… with its receipt context (no barcode). Props pinned:
//   receiptLine?: { text, priceText?, detail, scans }   shown on top as "On the receipt": one DetailList row (key the line as printed, state its
//                  price, detail "×1 at $3.49"); it is the dialog's description. No barcode line.
//   matches?: ReceiptMatch[]   "Is it one of these?": a radiogroup of the matches (Products first, then Lines), named "<name> Product · 4 pieces" /
//                  "<name> Line · 2 pieces". A first match that is a Product starts selected: the note "<Product>: 1 Scan at $3.49, and it ticks
//                  <Line>." (the "and it ticks" part only when the Product's Ingredient has an open Line) and the primary "Use <Product>" show.
//                  The rest of the Lines are "Other Lines" (a Line already offered is not repeated), then More Lines and Something else.
//   onUseProduct(productId)   the primary; nothing else is called (not onSave, not onAdded).
//   Picking a Line match goes on as picking that Line chip does. Both are only for the no-barcode sheet.
//   Something else keeps the short form; its new-name step also checks the Household's Products by name: "<Product> is already a Product. Use it?"
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OfflineProduct } from '../types'
import type { ReceiptLineInfo, ReceiptMatch } from './NewProductSheet'
import { choose, dialog, lineGroup, lines, openSomethingElse, packGroup, setup } from './newProduct.test-helper'

const receiptLine: ReceiptLineInfo = { text: 'KITCHEN ROLL 4 PACK', priceText: '$3.49', detail: '×1 at $3.49', scans: 1 }
const productMatch: ReceiptMatch = { kind: 'product', productId: 50, name: 'Kitchen roll 4 pack', ingredientId: 7, baseUnit: 'piece', packSize: 4 }
const lineMatch: ReceiptMatch = { kind: 'line', ingredientId: 7, name: 'Kitchen roll', baseUnit: 'piece', quantity: 2 }
const kitchenLine = { ingredientId: 7, name: 'Kitchen roll', baseUnit: 'piece' as const, quantity: 2, ticked: false }
const sheetLines = [kitchenLine, ...lines]
const knownProducts: OfflineProduct[] = [
  { id: 50, name: 'Kitchen roll 4 pack', ingredientId: 7, ingredientName: 'Kitchen roll', baseUnit: 'piece', packSize: 4, lastPriceCents: null },
]

const matchGroup = () => within(dialog()).getByRole('radiogroup', { name: 'Is it one of these?' })
const otherLines = () => within(dialog()).getByRole('group', { name: 'Other Lines' })
const receiptSetup = (over: Parameters<typeof setup>[0] = {}) =>
  setup({ noBarcode: true, barcode: undefined, lines: sheetLines, receiptLine, matches: [productMatch, lineMatch], products: knownProducts, onUseProduct: vi.fn(), ...over })

describe('On the receipt', () => {
  it('shows the line as one row under the overline, in a DetailList: key the printed line, state its price, detail the count', () => {
    receiptSetup()
    const block = within(dialog()).getByRole('region', { name: 'On the receipt' })
    expect(block).toHaveTextContent('On the receipt')
    const list = within(block).getByRole('list', { name: 'Receipt line' })
    expect(list).toHaveClass('detail-list')
    const row = within(list).getByRole('listitem')
    expect(row).toHaveTextContent('KITCHEN ROLL 4 PACK')
    expect(row).toHaveTextContent('$3.49')
    expect(row).toHaveTextContent('×1 at $3.49')
  })
  it('is the dialog\'s description, and there is no barcode line', () => {
    receiptSetup()
    expect(dialog()).toHaveAccessibleDescription(/KITCHEN ROLL 4 PACK/)
    expect(within(dialog()).queryByText(/not in Feeder yet/)).toBeNull()
  })
  it('a line with no price shows no state', () => {
    receiptSetup({ receiptLine: { text: 'KITCHEN ROLL 4 PACK', detail: '×1', scans: 1 } })
    const row = within(within(dialog()).getByRole('list', { name: 'Receipt line' })).getByRole('listitem')
    expect(row).toHaveTextContent('KITCHEN ROLL 4 PACK')
    expect(row).not.toHaveTextContent('$')
  })
  it('without a receipt line the block is not there', () => {
    receiptSetup({ receiptLine: undefined })
    expect(within(dialog()).queryByRole('region', { name: 'On the receipt' })).toBeNull()
  })
})

describe('Is it one of these?', () => {
  it('lists the Products first, then the Lines, as radios named with what they are', () => {
    receiptSetup()
    const radios = within(matchGroup()).getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios[0]).toHaveAccessibleName(/^Kitchen roll 4 pack.*Product · 4 pieces/)
    expect(radios[1]).toHaveAccessibleName(/^Kitchen roll.*Line · 2 pieces/)
  })
  it('a Product first is selected, and the primary says "Use" and its name', () => {
    receiptSetup()
    expect(within(matchGroup()).getAllByRole('radio')[0]).toBeChecked()
    expect(within(dialog()).getByRole('button', { name: 'Use Kitchen roll 4 pack' })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: /^Add/ })).toBeNull()
  })
  it('the note says the Scans, the price and the Line it ticks', () => {
    receiptSetup()
    expect(dialog()).toHaveTextContent('Kitchen roll 4 pack: 1 Scan at $3.49, and it ticks Kitchen roll.')
  })
  it('without an open Line of its Ingredient the note stops after the price', () => {
    receiptSetup({ lines, matches: [productMatch] })
    expect(dialog()).toHaveTextContent('Kitchen roll 4 pack: 1 Scan at $3.49.')
    expect(dialog()).not.toHaveTextContent('and it ticks')
  })
  it('two Scans are plural', () => {
    receiptSetup({ receiptLine: { text: 'KITCHEN ROLL 4 PACK', priceText: '$6.98', detail: '×2 at $6.98', scans: 2 } })
    expect(dialog()).toHaveTextContent('Kitchen roll 4 pack: 2 Scans at $6.98, and it ticks Kitchen roll.')
  })
  it('"Use <Product>" hands the Product back and nothing else', async () => {
    const { props } = receiptSetup()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Use Kitchen roll 4 pack' }))
    expect(props.onUseProduct).toHaveBeenCalledTimes(1)
    expect(props.onUseProduct).toHaveBeenCalledWith(50)
    expect(props.onSave).not.toHaveBeenCalled()
    expect(props.onAdded).not.toHaveBeenCalled()
  })
  it('picking the Line match goes on as the Line chip does: its Ingredient is chosen and the pack sizes show', async () => {
    receiptSetup()
    await userEvent.click(within(matchGroup()).getAllByRole('radio')[1]!)
    expect(packGroup()).toBeInTheDocument()
    expect(within(dialog()).getByRole('heading', { name: 'Kitchen roll · Ingredient' })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: 'Use Kitchen roll 4 pack' })).toBeNull()
  })
  it('when the first match is a Line nothing is selected, and there is no "Use"', () => {
    receiptSetup({ matches: [lineMatch] })
    expect(within(matchGroup()).getAllByRole('radio').some((r) => (r as HTMLInputElement).checked || r.getAttribute('aria-checked') === 'true')).toBe(false)
    expect(within(dialog()).queryByRole('button', { name: /^Use / })).toBeNull()
  })
  it('the other Lines come under "Other Lines", without the Line already offered, then More Lines and Something else', () => {
    receiptSetup()
    expect(within(dialog()).queryByRole('group', { name: 'Which Line is it?' })).toBeNull()
    expect(within(otherLines()).queryByRole('button', { name: /^Kitchen roll/ })).toBeNull()
    expect(within(otherLines()).getByRole('button', { name: /^Mozzarella/ })).toBeInTheDocument()
    expect(within(otherLines()).getByRole('button', { name: 'Something else' })).toBeInTheDocument()
  })
  it('with no matches the step is "Which Line is it?" as before, and the receipt block stays', () => {
    receiptSetup({ matches: [] })
    expect(within(dialog()).queryByRole('radiogroup', { name: 'Is it one of these?' })).toBeNull()
    expect(lineGroup()).toBeInTheDocument()
    expect(within(dialog()).getByRole('region', { name: 'On the receipt' })).toBeInTheDocument()
  })
  it('matches are only for a sheet without a barcode', () => {
    setup({ lines: sheetLines, matches: [productMatch], receiptLine, onUseProduct: vi.fn() })
    expect(within(dialog()).queryByRole('radiogroup', { name: 'Is it one of these?' })).toBeNull()
  })
})

describe('Something else, with a receipt line', () => {
  it('keeps the short form: Ingredient | Supply and the Select', async () => {
    receiptSetup()
    await userEvent.click(within(otherLines()).getByRole('button', { name: 'Something else' }))
    expect(within(dialog()).getByRole('combobox', { name: /Ingredient/ })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('radiogroup', { name: 'Is it one of these?' })).toBeNull()
  })
  it('a new name that is a Product already says so, and "Use <Product>" hands it back', async () => {
    const { props } = receiptSetup({ matches: [], lines })
    await openSomethingElse()
    await choose(/Ingredient/, /New Ingredient/, 'Kitchen roll 4 pack')
    const guard = await screen.findByRole('status')
    expect(guard).toHaveTextContent('Kitchen roll 4 pack is already a Product. Use it?')
    await userEvent.click(within(guard).getByRole('button', { name: 'Use Kitchen roll 4 pack' }))
    await waitFor(() => expect(props.onUseProduct).toHaveBeenCalledWith(50))
    expect(props.onSave).not.toHaveBeenCalled()
  })
  it('a new name that is no Product raises no such guard', async () => {
    receiptSetup({ matches: [], lines })
    await openSomethingElse()
    await choose(/Ingredient/, /New Ingredient/, 'Dish brush')
    expect(screen.queryByText(/is already a Product/)).toBeNull()
  })
})
