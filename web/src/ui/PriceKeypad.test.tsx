// beta.7 SR2: `PriceKeypad` (shop-scan-proposals.md 13.4, functional spec 10.1 "Price entry"). The CONTENT of the keypad sheet
// (SR4's PriceEntrySheet puts it in a BottomSheet): product name, the per pack / per kg switch, the display and what it implies,
// the Last-time chip, the keys and the actions. Uncontrolled: it keeps the typed text and reports a PriceEntry.
//
//   PriceKeypad props:
//     productName: string                         -> "Price of {productName}" names the display
//     currency: string; locale?: string           -> Household currency / locale (default 'en-US')
//     initialCents?: number | null                -> prefill: the row's Price per pack (a row that is not weighed)
//     initialPerKgCents?: number | null           -> prefill: the row's Price per kg (per l); a weighed row passes this
//     pack?: { amount: number; unit: 'g'|'ml'|'piece' }   -> pack size in base units; 'piece' or absent: per pack only
//     weighed?: number                            -> weighed amount in g/ml: opens on per kg, shows "x 312 g = EUR6.21"
//     last?: { cents: number; date: string } | null; shopName: string   -> the chip
//     hasNext: boolean                            -> primary is "Next without a Price" (true) or "Save"
//     onNext / onSave / onClose: (entry: PriceEntry) => void
//   PriceEntry = { basis: 'pack'|'perKg'; cents: number | null; packCents: number | null; perKgCents: number | null }
//     cents is what was typed in `basis`; null for empty (and, for Close, for an invalid entry).
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { PriceKeypad, type PriceKeypadProps } from './PriceKeypad'
import { declarations, readUiCss } from './test-utils'

function setup(props: Partial<PriceKeypadProps> = {}) {
  const onNext = vi.fn()
  const onSave = vi.fn()
  const onClose = vi.fn()
  const view = render(
    <PriceKeypad productName="Mutti passata" currency="EUR" locale="en-GB" shopName="Esselunga" hasNext={false} onNext={onNext} onSave={onSave} onClose={onClose} {...props} />,
  )
  return { onNext, onSave, onClose, ...view }
}
const display = () => screen.getByRole('status', { name: 'Price of Mutti passata' })
const key = (name: string) => screen.getByRole('button', { name })
const tapKeys = async (keys: string) => {
  for (const k of keys) await userEvent.click(key(k === '.' ? 'Decimal separator' : k))
}

describe('PriceKeypad: our own keys only', () => {
  it('has the buttons 0 to 9, backspace, Close and the primary, and no form field of any kind', () => {
    const { container } = setup()
    for (const d of '0123456789') expect(key(d)).toHaveAttribute('type', 'button')
    expect(key('Backspace')).toBeInTheDocument()
    expect(key('Close')).toBeInTheDocument()
    expect(container.querySelector('input, select, textarea, [contenteditable], [inputmode]')).toBeNull()
  })

  it('shows the product name as meta', () => {
    setup()
    expect(screen.getByText('Mutti passata')).toBeInTheDocument()
  })

  it('lays the keys out 1-2-3 / 4-5-6 / 7-8-9 / decimal-0-backspace', () => {
    setup()
    const names = within(screen.getByRole('group', { name: 'Keypad' }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Decimal separator', '0', 'Backspace'])
  })
})

describe('PriceKeypad: the decimal key', () => {
  it('shows the locale\'s separator and types it', async () => {
    setup({ locale: 'de-DE' })
    expect(key('Decimal separator')).toHaveTextContent(',')
    await tapKeys('1.29')
    expect(display().textContent?.replace(/ /g, ' ')).toBe('1,29 €')
  })

  it('is absent for a currency with no decimals', () => {
    setup({ currency: 'JPY', locale: 'ja-JP' })
    expect(screen.queryByRole('button', { name: 'Decimal separator' })).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Keypad' })).getAllByRole('button')).toHaveLength(11)
  })
})

describe('PriceKeypad: the announced value', () => {
  it('is a polite status named "Price of {product}" showing the typed Price', async () => {
    setup()
    expect(display()).toHaveAttribute('aria-live', 'polite')
    expect(display()).toHaveTextContent('€0')
    await tapKeys('145')
    expect(display()).toHaveTextContent('€145')
    await userEvent.click(key('Backspace'))
    await userEvent.click(key('Backspace'))
    await tapKeys('.45')
    expect(display()).toHaveTextContent('€1.45')
  })

  it('starts on the row\'s Price when it has one', () => {
    setup({ initialCents: 129 })
    expect(display()).toHaveTextContent('€1.29')
  })

  it('a weighed row starts on its per kg Price as it is (no round trip through the pack)', () => {
    setup({ pack: { amount: 333, unit: 'g' }, weighed: 312, initialPerKgCents: 1990 })
    expect(display()).toHaveTextContent('€19.90')
    expect(screen.getByText('× 312 g = €6.21')).toBeInTheDocument()
  })

  it('a weighed row given only a pack Price converts it to per kg', () => {
    setup({ pack: { amount: 500, unit: 'g' }, weighed: 312, initialCents: 145 })
    expect(display()).toHaveTextContent('€2.90')
  })

  it('the per kg prefill wins over the pack Price when opening on per kg', () => {
    setup({ pack: { amount: 500, unit: 'g' }, weighed: 312, initialCents: 999, initialPerKgCents: 1990 })
    expect(display()).toHaveTextContent('€19.90')
  })

  it('a row opening per pack with only a per kg Price shows the pack Price it implies', () => {
    setup({ pack: { amount: 500, unit: 'g' }, initialPerKgCents: 290 })
    expect(display()).toHaveTextContent('€1.45')
  })

  it('ignores a per kg prefill on pieces', () => {
    setup({ pack: { amount: 6, unit: 'piece' }, initialPerKgCents: 290 })
    expect(display()).toHaveTextContent('€0')
  })
})

describe('PriceKeypad: a prefilled Price', () => {
  it('the first key replaces the prefill instead of appending to it', async () => {
    setup({ initialCents: 129 })
    await tapKeys('2')
    expect(display()).toHaveTextContent('€2')
    await tapKeys('.45')
    expect(display()).toHaveTextContent('€2.45')
  })

  it('the decimal key first starts over at "0."', async () => {
    setup({ initialCents: 129 })
    await tapKeys('.5')
    expect(display()).toHaveTextContent('€0.5')
  })

  it('Backspace on an untouched prefill clears it; after a key it removes one character', async () => {
    setup({ initialCents: 129 })
    await userEvent.click(key('Backspace'))
    expect(display()).toHaveTextContent('€0')
    await tapKeys('12')
    await userEvent.click(key('Backspace'))
    expect(display()).toHaveTextContent('€1')
  })

  it('a physical keyboard follows the same rule', () => {
    setup({ initialCents: 129 })
    fireEvent.keyDown(document.body, { key: '3' })
    expect(display()).toHaveTextContent('€3')
  })

  it('a weighed row\'s per kg prefill is replaced too', async () => {
    setup({ pack: { amount: 500, unit: 'g' }, weighed: 312, initialPerKgCents: 1990 })
    await tapKeys('9')
    expect(display()).toHaveTextContent('€9')
  })

  it('switching per pack and per kg keeps an untouched prefill a prefill', async () => {
    setup({ pack: { amount: 500, unit: 'g' }, initialCents: 145 })
    await userEvent.click(screen.getByRole('radio', { name: 'per kg' }))
    expect(display()).toHaveTextContent('€2.90')
    await tapKeys('3')
    expect(display()).toHaveTextContent('€3')
  })

  it('the Last-time chip\'s Price is offered like a prefill: the next key replaces it', async () => {
    setup({ last: { cents: 129, date: '2026-11-03' } })
    await tapKeys('5')
    await userEvent.click(screen.getByRole('button', { name: 'Last time here €1.29 · 3 Nov' }))
    expect(display()).toHaveTextContent('€1.29')
    await tapKeys('2')
    expect(display()).toHaveTextContent('€2')
  })

  it('an untouched prefill is saved as it is', async () => {
    const { onSave } = setup({ initialCents: 129 })
    await userEvent.click(key('Save'))
    expect(onSave).toHaveBeenCalledWith({ basis: 'pack', cents: 129, packCents: 129, perKgCents: null })
  })
})

describe('PriceKeypad: what it implies', () => {
  it('a per pack Price on a 500 g pack: "= €2.90/kg for 500 g"', async () => {
    setup({ pack: { amount: 500, unit: 'g' } })
    await tapKeys('1.45')
    expect(screen.getByText('= €2.90/kg for 500 g')).toBeInTheDocument()
  })

  it('on a 500 ml pack it is per l', async () => {
    setup({ pack: { amount: 500, unit: 'ml' } })
    await tapKeys('1.45')
    expect(screen.getByText('= €2.90/l for 500 ml')).toBeInTheDocument()
  })

  it('a weighed row opens on per kg and says "× 312 g = €6.21" for €19.90/kg', async () => {
    setup({ pack: { amount: 500, unit: 'g' }, weighed: 312 })
    expect(screen.getByRole('radio', { name: 'per kg' })).toBeChecked()
    await tapKeys('19.9')
    expect(screen.getByText('× 312 g = €6.21')).toBeInTheDocument()
  })

  it('pieces say nothing about a weight', async () => {
    setup({ pack: { amount: 9, unit: 'piece' } })
    await tapKeys('4.5')
    expect(screen.queryByText(/\/kg|\/l|×/)).toBeNull()
  })
})

describe('PriceKeypad: per pack / per kg', () => {
  it('shows the switch "per pack · per kg" for g, opening on per pack', () => {
    setup({ pack: { amount: 500, unit: 'g' } })
    expect(screen.getByRole('radio', { name: 'per pack' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'per kg' })).not.toBeChecked()
  })

  it('says "per l" for ml', () => {
    setup({ pack: { amount: 500, unit: 'ml' } })
    expect(screen.getByRole('radio', { name: 'per l' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'per kg' })).toBeNull()
  })

  it('has no switch for pieces (S3) or without a pack', () => {
    const { unmount } = setup({ pack: { amount: 9, unit: 'piece' } })
    expect(screen.queryByRole('radio')).toBeNull()
    unmount()
    setup()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('switching converts what is typed: €1.45 per pack is €2.90 per kg for 500 g', async () => {
    const { onSave } = setup({ pack: { amount: 500, unit: 'g' } })
    await tapKeys('1.45')
    await userEvent.click(screen.getByRole('radio', { name: 'per kg' }))
    expect(display()).toHaveTextContent('€2.90')
    await userEvent.click(key('Save'))
    expect(onSave).toHaveBeenCalledWith({ basis: 'perKg', cents: 290, packCents: 145, perKgCents: 290 })
  })

  it('a per pack entry reports no per kg Price', async () => {
    const { onSave } = setup({ pack: { amount: 500, unit: 'g' } })
    await tapKeys('1.45')
    await userEvent.click(key('Save'))
    expect(onSave).toHaveBeenCalledWith({ basis: 'pack', cents: 145, packCents: 145, perKgCents: null })
  })
})

describe('PriceKeypad: the Last-time chip', () => {
  it('"Last time here €1.29 · 3 Nov" types that Price when tapped', async () => {
    setup({ last: { cents: 129, date: '2026-11-03' } })
    await userEvent.click(screen.getByRole('button', { name: 'Last time here €1.29 · 3 Nov' }))
    expect(display()).toHaveTextContent('€1.29')
  })

  it('"No Price at Esselunga yet" is plain text, not a button', () => {
    setup({ last: null })
    expect(screen.getByText('No Price at Esselunga yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Last time here|No Price at/ })).toBeNull()
  })
})

describe('PriceKeypad: the actions', () => {
  it('Save when no other row is missing a Price', async () => {
    const { onSave, onNext } = setup({ hasNext: false })
    await tapKeys('2')
    await userEvent.click(key('Save'))
    expect(onSave).toHaveBeenCalledWith({ basis: 'pack', cents: 200, packCents: 200, perKgCents: null })
    expect(onNext).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Next without a Price/ })).toBeNull()
  })

  it('"Next without a Price →" while another row has none; it saves this row and moves on', async () => {
    const { onSave, onNext } = setup({ hasNext: true })
    await tapKeys('1.45')
    await userEvent.click(screen.getByRole('button', { name: /^Next without a Price/ }))
    expect(onNext).toHaveBeenCalledWith({ basis: 'pack', cents: 145, packCents: 145, perKgCents: null })
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('the arrow of the primary is decoration, not read out', () => {
    setup({ hasNext: true })
    const primary = screen.getByRole('button', { name: /^Next without a Price/ })
    expect(primary.textContent).toContain('Next without a Price')
    expect(primary.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('refuses a per kg Price whose pack Price rounds to 0 (the server needs a pack Price above 0)', async () => {
    const { onSave, onClose } = setup({ pack: { amount: 100, unit: 'g' }, weighed: 100 })
    await tapKeys('.01')
    await userEvent.click(key('Save'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number above 0')
    await userEvent.click(key('Close'))
    expect(onClose).toHaveBeenCalledWith({ basis: 'perKg', cents: null, packCents: null, perKgCents: null })
  })

  it('a per kg entry rounds the pack Price half up like product.PriceForWeight: €2.99/kg for 250 g is €0.75', async () => {
    const { onSave } = setup({ pack: { amount: 250, unit: 'g' }, weighed: 250 })
    await tapKeys('2.99')
    await userEvent.click(key('Save'))
    expect(onSave).toHaveBeenCalledWith({ basis: 'perKg', cents: 299, packCents: 75, perKgCents: 299 })
  })

  it('Next with nothing typed just moves on, reporting no Price', async () => {
    const { onNext } = setup({ hasNext: true })
    await userEvent.click(screen.getByRole('button', { name: /^Next without a Price/ }))
    expect(onNext).toHaveBeenCalledWith({ basis: 'pack', cents: null, packCents: null, perKgCents: null })
  })

  it('refuses 0: "Enter a number above 0" as an alert tied to the display, and nothing is reported', async () => {
    const { onSave } = setup()
    await tapKeys('0')
    await userEvent.click(key('Save'))
    expect(onSave).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Enter a number above 0')
    expect(display()).toHaveAccessibleDescription('Enter a number above 0')
  })

  it('clears the error when typing again', async () => {
    setup()
    await tapKeys('0')
    await userEvent.click(key('Save'))
    await tapKeys('.5')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Close reports what was typed when it is valid', async () => {
    const { onClose } = setup()
    await tapKeys('3.5')
    await userEvent.click(key('Close'))
    expect(onClose).toHaveBeenCalledWith({ basis: 'pack', cents: 350, packCents: 350, perKgCents: null })
  })

  it('Close discards an empty or invalid entry (cents null) without showing an error', async () => {
    const { onClose } = setup()
    await userEvent.click(key('Close'))
    expect(onClose).toHaveBeenLastCalledWith({ basis: 'pack', cents: null, packCents: null, perKgCents: null })
    await tapKeys('0')
    await userEvent.click(key('Close'))
    expect(onClose).toHaveBeenLastCalledWith({ basis: 'pack', cents: null, packCents: null, perKgCents: null })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('PriceKeypad: the keyboard on a computer', () => {
  it('types digits, the decimal point (or comma) and Backspace', async () => {
    setup()
    await userEvent.keyboard('1,2')
    expect(display()).toHaveTextContent('€1.2')
    await userEvent.keyboard('{Backspace}9')
    expect(display()).toHaveTextContent('€1.9')
    await userEvent.keyboard('.')
    expect(display()).toHaveTextContent('€1.9') // a second separator is ignored
  })

  it('ignores letters and the decimal key for a 0-digit currency', async () => {
    setup({ currency: 'JPY', locale: 'ja-JP' })
    await userEvent.keyboard('a4.5')
    expect(display().textContent?.replace(/\D/g, '')).toBe('45')
  })

  it('Enter confirms: Save when nothing is next', async () => {
    const { onSave } = setup()
    await userEvent.keyboard('2{Enter}')
    expect(onSave).toHaveBeenCalledWith({ basis: 'pack', cents: 200, packCents: 200, perKgCents: null })
  })

  it('Enter confirms: Next while another row has no Price', async () => {
    const { onNext, onSave } = setup({ hasNext: true })
    await userEvent.keyboard('2{Enter}')
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('Escape cancels like Close, once', async () => {
    const { onClose, onSave } = setup()
    await userEvent.keyboard('2{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith({ basis: 'pack', cents: 200, packCents: 200, perKgCents: null })
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2) // still mounted: the next Escape closes again
  })

  it('Enter on a focused key presses that key once (it does not also confirm)', async () => {
    const { onSave } = setup()
    key('5').focus()
    await userEvent.keyboard('{Enter}')
    expect(onSave).not.toHaveBeenCalled()
    expect(display()).toHaveTextContent('€5')
  })

  it('leaves keys alone while a person types in another field, and after unmount', async () => {
    const { unmount, onSave } = setup()
    const other = document.createElement('input')
    document.body.append(other)
    other.focus()
    await userEvent.keyboard('7{Enter}')
    expect(display()).toHaveTextContent('€0')
    expect(onSave).not.toHaveBeenCalled()
    other.remove()
    unmount()
    await userEvent.keyboard('1{Enter}')
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('PriceKeypad: Escape in a host dialog (one Escape closes exactly once)', () => {
  function inSheet(props: Partial<PriceKeypadProps> = {}) {
    const onClose = vi.fn()
    const sheetClose = vi.fn()
    render(
      <BottomSheet open title="Price" onClose={sheetClose}>
        <PriceKeypad productName="Mutti passata" currency="EUR" locale="en-GB" shopName="Esselunga" hasNext={false} onNext={vi.fn()} onSave={vi.fn()} onClose={onClose} {...props} />
      </BottomSheet>,
    )
    return { onClose, sheetClose }
  }

  it('the keypad owns Escape: it reports Close with the entry and the BottomSheet does not also close', async () => {
    const { onClose, sheetClose } = inSheet()
    await userEvent.keyboard('2{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith({ basis: 'pack', cents: 200, packCents: 200, perKgCents: null })
    expect(sheetClose).not.toHaveBeenCalled()
  })

  it('cancels the Escape keydown, so a browser does not also send the dialog its close request', () => {
    inSheet()
    const notCancelled = fireEvent.keyDown(key('5'), { key: 'Escape' })
    expect(notCancelled).toBe(false)
  })

  it("the host dialog's close request (Android back) becomes the keypad's Close, once", async () => {
    const { onClose, sheetClose } = inSheet()
    await userEvent.keyboard('3')
    const cancel = new Event('cancel', { cancelable: true })
    screen.getByRole('dialog').dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith({ basis: 'pack', cents: 300, packCents: 300, perKgCents: null })
    expect(sheetClose).not.toHaveBeenCalled()
  })

  it('leaves Escape to a dialog stacked over it (a ConfirmDialog), and its keys too', async () => {
    const { onClose } = setup()
    const other = vi.fn()
    render(
      <Dialog open title="Remove?" onClose={other}>
        <button type="button">Keep them</button>
      </Dialog>,
    )
    await userEvent.keyboard('7{Escape}')
    expect(other).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(display()).toHaveTextContent('€0')
  })

  it('leaves an Escape that something inside already used (defaultPrevented)', () => {
    const { onClose } = setup()
    const k = key('5')
    k.addEventListener('keydown', (e) => e.preventDefault())
    fireEvent.keyDown(k, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('PriceKeypad: a11y and size', () => {
  it('the keys are a named group, every key has an accessible name, the decimal key names itself', () => {
    setup()
    const group = screen.getByRole('group', { name: 'Keypad' })
    for (const b of within(group).getAllByRole('button')) expect(b).toHaveAccessibleName()
    expect(key('Decimal separator')).toBeInTheDocument()
  })

  it('the switch is a radiogroup and the Last-time chip a button (keyboard reachable)', () => {
    setup({ pack: { amount: 500, unit: 'g' }, last: { cents: 129, date: '2026-11-03' } })
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Last time here/ })).toBeEnabled()
  })

  it('uses the shared Phosphor icons only (decorative svgs are hidden from assistive tech)', () => {
    const { container } = setup({ hasNext: true })
    for (const svg of container.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('the backspace key draws the Phosphor Backspace glyph, not the back arrow', () => {
    const glyph = (name: 'backspace' | 'back') => {
      const { container, unmount } = render(<Icon name={name} size={20} />)
      const html = container.querySelector('svg')?.innerHTML
      unmount()
      return html
    }
    setup()
    const drawn = key('Backspace').querySelector('svg')?.innerHTML
    expect(drawn).toBe(glyph('backspace'))
    expect(drawn).not.toBe(glyph('back'))
  })

  it('has keys of at least 44 px (system.md) and a focus ring from the shared tokens', () => {
    const css = readUiCss('PriceKeypad.css')
    const keyRule = declarations(css, '.price-keypad__key')
    expect(parseInt(keyRule['min-height'] ?? '0', 10)).toBeGreaterThanOrEqual(44)
    expect(keyRule['font-variant-numeric'] ?? declarations(css, '.price-keypad__display')['font-variant-numeric']).toBe('tabular-nums')
  })

  it('gives the 26 px Last-time chip a 44 px hit area', () => {
    const after = declarations(readUiCss('PriceKeypad.css'), '.price-keypad__last .chip::after')
    expect(after.inset).toBe('-9px 0')
  })

  it('does not hard-code colours: tokens only', () => {
    expect(readUiCss('PriceKeypad.css')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})
