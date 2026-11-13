// SR4: PriceEntrySheet replaces PriceEditSheet (shop-scan-proposals.md 13.4). It wraps PriceKeypad in a BottomSheet, keyed by
// the row so it remounts for the next row, and reports Save, Next and Close. Typing is tested in ui/PriceKeypad.test.tsx.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildScannedRows, type ScannedRow } from '../lib/scannedList'
import { applied, cheese, passata, products, toiletPaper } from '../lib/scannedList.testData'
import { priceContext } from '../lib/priceContext'
import { PriceEntrySheet, type PriceEntrySheetProps } from './PriceEntrySheet'

const rowOf = (entry: ReturnType<typeof applied>): ScannedRow => buildScannedRows([entry], products)[0]!
const mutti = rowOf(applied('u-1', passata, {}, { onList: true }))
const paper = rowOf(applied('u-3', toiletPaper))
const loose = rowOf(applied('u-4', cheese, { quantity: 312, weighed: true, priceCents: 624, pricePerKgCents: 2000 }, { quantity: 312, priceCents: 624 }))

function setup(over: Partial<PriceEntrySheetProps> = {}) {
  const props: PriceEntrySheetProps = {
    row: mutti,
    shopName: 'Esselunga',
    currency: 'USD',
    ...priceContext(passata),
    hasNext: false,
    error: null,
    onNext: vi.fn(),
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  const view = render(<PriceEntrySheet {...props} />)
  return { props, ...view }
}
// The sheet has two buttons named "Close": the BottomSheet header's X and the keypad's own Close. Each query is scoped.
const keypadClose = () => within(document.querySelector<HTMLElement>('.price-keypad')!).getByRole('button', { name: 'Close' })
const headerClose = () => within(document.querySelector<HTMLElement>('.sheet__header')!).getByRole('button', { name: 'Close' })
const tap = async (keys: string) => {
  for (const k of keys) await userEvent.click(screen.getByRole('button', { name: k === '.' ? 'Decimal separator' : k }))
}

describe('PriceEntrySheet', () => {
  it('is a dialog "Price of <product>" with the keypad inside, naming the row and the Shop', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Price of Mutti passata 700 g' })
    expect(dialog).toContainElement(screen.getByRole('group', { name: 'Keypad' }))
    expect(screen.getByRole('status', { name: 'Price of Mutti passata 700 g' })).toBeInTheDocument()
  })

  it('offers per pack and per kg for a Product in grams, and "Last time here" with the last Price', () => {
    setup()
    expect(screen.getByRole('radio', { name: 'per pack' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'per kg' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /Last time here \$1\.29/ })).toBeInTheDocument()
  })

  it('says "No Price at <Shop> yet" when there is no last Price', () => {
    setup({ last: null })
    expect(screen.getByText('No Price at Esselunga yet')).toBeInTheDocument()
  })

  it('a weighed row opens on per kg with its Price per kg', () => {
    setup({ row: loose, ...priceContext(cheese), weighed: loose.weight ?? undefined, initialPerKgCents: 2000 })
    expect(screen.getByRole('radio', { name: 'per kg' })).toBeChecked()
    expect(screen.getByRole('status', { name: 'Price of Loose cheese' })).toHaveTextContent('20.00')
  })

  it('pieces have only per pack: no switch', () => {
    setup({ row: paper, ...priceContext(toiletPaper), last: null })
    expect(screen.queryByRole('radio', { name: 'per kg' })).toBeNull()
  })

  it('Save reports what was typed once, when no other row lacks a Price', async () => {
    const { props } = setup()
    await tap('145')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledWith({ basis: 'pack', cents: 145, packCents: 145, perKgCents: null })
    expect(props.onNext).not.toHaveBeenCalled()
  })

  it('"Next without a Price" is the primary while another row has none, and reports what was typed', async () => {
    const { props } = setup({ hasNext: true })
    await tap('1.45')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Next without a Price/ }))
    expect(props.onNext).toHaveBeenCalledWith({ basis: 'pack', cents: 145, packCents: 145, perKgCents: null })
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('Close, the sheet header Close and Escape each fire onClose once', async () => {
    const first = setup()
    await userEvent.click(keypadClose())
    expect(first.props.onClose).toHaveBeenCalledTimes(1)
    first.unmount()

    // The header X (and the backdrop) close without the typed value: only the keypad holds it (accepted, review SR4).
    const header = setup()
    await tap('2')
    await userEvent.click(headerClose())
    expect(header.props.onClose).toHaveBeenCalledTimes(1)
    expect(header.props.onClose).toHaveBeenCalledWith({ basis: 'pack', cents: null, packCents: null, perKgCents: null })
    header.unmount()

    const escape = setup()
    await userEvent.keyboard('{Escape}')
    expect(escape.props.onClose).toHaveBeenCalledTimes(1)
  })

  it('Close hands over the typed entry (the screen saves a valid one and discards an empty one)', async () => {
    const { props } = setup()
    await tap('2')
    await userEvent.click(keypadClose())
    expect(props.onClose).toHaveBeenCalledWith({ basis: 'pack', cents: 2, packCents: 2, perKgCents: null })
  })

  it('shows a refusal or a failed save under the display as an alert, and keeps the entry open', () => {
    setup({ error: 'Enter a number above 0' })
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number above 0')
    expect(screen.getByRole('dialog', { name: 'Price of Mutti passata 700 g' })).toBeInTheDocument()
  })

  it('is keyed by the row: the next row remounts the keypad, empty, with its own name', async () => {
    const view = setup()
    await tap('99')
    expect(screen.getByRole('status', { name: 'Price of Mutti passata 700 g' })).toHaveTextContent('0.99')
    view.rerender(<PriceEntrySheet {...view.props} row={paper} {...priceContext(toiletPaper)} last={null} />)
    expect(screen.getByRole('dialog', { name: 'Price of Regina toilet paper 9 pieces' })).toBeInTheDocument()
    const display = screen.getByRole('status', { name: 'Price of Regina toilet paper 9 pieces' })
    expect(display).not.toHaveTextContent('0.99')
  })
})
