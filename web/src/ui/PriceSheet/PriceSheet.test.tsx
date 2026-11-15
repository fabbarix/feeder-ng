// B9-43 (SSP-13): `ui/PriceSheet`, lifted from scan/components/PriceEntrySheet.tsx so the Shop's Line sheet ("Change the Price") and Scan
// share one Price sheet around ui/PriceKeypad. Same contract as Scan's sheet, with these generalisations:
//   - it takes the Product's name, not a ScannedRow (productName, shopName, currency, pack, last, initialCents, weighed, initialPerKgCents);
//   - `hasNext` and `onNext` are optional (default: the primary is Save); `modal` (default true) false = Scan's non-modal half sheet;
//   - ONE Close: the keypad's footer Close (outlined secondary). The sheet header's circular Close is not drawn (R-B: one Close per sheet).
// Typing is tested in ui/PriceKeypad.test.tsx.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PriceSheet, type PriceSheetProps } from './PriceSheet'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

function setup(over: Partial<PriceSheetProps> = {}) {
  const props: PriceSheetProps = {
    productName: 'Onion pack',
    shopName: 'Coop',
    currency: 'USD',
    pack: { amount: 6, unit: 'piece' },
    last: { cents: 299, date: '2026-11-14' },
    error: null,
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  const view = render(<PriceSheet {...props} />)
  return { props, ...view }
}
const dialog = () => screen.getByRole('dialog', { name: 'Price of Onion pack' })
const tap = async (keys: string) => {
  for (const k of keys) await userEvent.click(screen.getByRole('button', { name: k === '.' ? 'Decimal separator' : k }))
}

describe('PriceSheet', () => {
  it('is a dialog "Price of <product>" with the keypad inside, naming the Product and the Shop', () => {
    setup()
    expect(dialog()).toContainElement(screen.getByRole('group', { name: 'Keypad' }))
    expect(screen.getByRole('status', { name: 'Price of Onion pack' })).toBeInTheDocument()
    expect(dialog()).toHaveTextContent('Coop')
  })

  it('is modal by default, and with modal={false} the non-modal half sheet of Scan (the list stays in view)', () => {
    const first = setup()
    expect(dialog()).not.toHaveAttribute('data-modal', 'false')
    first.unmount()
    setup({ modal: false })
    expect(dialog()).toHaveAttribute('data-modal', 'false')
    expect(dialog()).toHaveAttribute('data-size', 'half')
  })

  it('has ONE Close: the keypad\'s, none in the header (R-B)', () => {
    setup()
    expect(within(dialog()).getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(dialog().querySelector('.sheet__header button')).toBeNull()
    expect(within(dialog()).queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('shows the last Price paid here as a "Last time here" chip', () => {
    setup()
    expect(screen.getByRole('button', { name: /Last time here \$2\.99/ })).toBeInTheDocument()
  })

  it('"No Price at <Shop> yet" without a last Price', () => {
    setup({ last: null })
    expect(screen.getByText('No Price at Coop yet')).toBeInTheDocument()
  })

  it('opens prefilled with initialCents, and the first key replaces it', async () => {
    setup({ initialCents: 299 })
    const display = screen.getByRole('status', { name: 'Price of Onion pack' })
    expect(display).toHaveTextContent('$2.99')
    await tap('3')
    expect(display).not.toHaveTextContent('2.99')
  })

  it('Save (the primary, with no Next) reports what was typed once', async () => {
    const { props } = setup()
    await tap('3.49')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave).toHaveBeenCalledExactlyOnceWith({ basis: 'pack', cents: 349, packCents: 349, perKgCents: null })
  })

  it('with hasNext the primary is "Next without a Price" and calls onNext (Scan)', async () => {
    const onNext = vi.fn()
    const { props } = setup({ hasNext: true, onNext })
    await tap('1.45')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Next without a Price/ }))
    expect(onNext).toHaveBeenCalledExactlyOnceWith({ basis: 'pack', cents: 145, packCents: 145, perKgCents: null })
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('Close and Escape each report onClose once with what was typed', async () => {
    const first = setup()
    await tap('2')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(first.props.onClose).toHaveBeenCalledExactlyOnceWith({ basis: 'pack', cents: 200, packCents: 200, perKgCents: null })
    first.unmount()
    const second = setup()
    await userEvent.keyboard('{Escape}')
    expect(second.props.onClose).toHaveBeenCalledTimes(1)
  })

  it('a refusal or failed save is shown under the keypad and the sheet stays', () => {
    setup({ error: 'Could not save that Price. Try again.' })
    expect(within(dialog()).getByText('Could not save that Price. Try again.')).toBeInTheDocument()
  })

  it('pieces have only per pack (no per kg switch); grams offer both', () => {
    setup()
    expect(dialog()).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'per kg' })).toBeNull()
  })

  it('a pack in grams offers per pack and per kg', () => {
    setup({ pack: { amount: 700, unit: 'g' } })
    expect(screen.getByRole('radio', { name: 'per pack' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'per kg' })).toBeInTheDocument()
  })

  it('an entryKey keeps what was typed while the caller re-keys', async () => {
    const view = setup({ entryKey: 'k1' })
    await tap('0.99')
    view.rerender(<PriceSheet {...view.props} productName="Onion pack" entryKey="k1" />)
    expect(screen.getByRole('status', { name: 'Price of Onion pack' })).toHaveTextContent('0.99')
  })
})

describe('the lift (plan: ui/PriceSheet/** lifted from scan/components/PriceEntrySheet.tsx)', () => {
  it('Scan\'s PriceEntrySheet is now a thin wrapper that renders the shared PriceSheet', () => {
    const src = readFileSync(`${cwd}/src/features/scan/components/PriceEntrySheet.tsx`, 'utf8')
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/ui\/PriceSheet'/)
    expect(src).not.toMatch(/PriceKeypad/)
    expect(src).not.toMatch(/BottomSheet/)
  })
})
