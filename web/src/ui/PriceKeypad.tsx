import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './Button'
import { Chip } from './Chip'
import { Icon } from './Icon'
import { Segmented } from './fields/Segmented'
import { decimalSeparator, formatTyped, hasDecimalKey, lastPriceHint, noPriceHint, pressBackspace, pressDecimal, pressDigit, typedFromMinor, typedToMinor } from './lib/moneyInput'
import { impliedLine, type PackSize } from './lib/priceImplication'
import { packFromPerKg, perKgFromPack, priceBasisOptions, supportsPerKg, type PriceBasis } from './lib/perKgPrice'
import { uiStrings } from './strings'
import './PriceKeypad.css'

/** What the keypad reports: `cents` is what was typed, in `basis`; null when nothing valid was typed. */
export interface PriceEntry {
  basis: PriceBasis
  cents: number | null
  packCents: number | null
  perKgCents: number | null
}

export interface PriceKeypadProps {
  productName: string
  currency: string
  locale?: string
  /**
   * The row's Price per pack (the Price record's `priceCents`), in minor units. A row that is not weighed passes this.
   * It opens in the opening basis: converted to per kg when a weighed row has no `initialPerKgCents`.
   */
  initialCents?: number | null
  /**
   * The row's Price per kg (per l), in minor units: what a weighed row holds (the Price record's `pricePerKgCents`, the
   * scan's `pricePerKgCents`). A weighed row passes this, never its per-scan Price (that is the weighed amount's cost, not a
   * pack Price). It wins over `initialCents` when the keypad opens on per kg; ignored without a per kg switch.
   */
  initialPerKgCents?: number | null
  /** The pack size in base units. Without it (or for pieces) there is no per kg switch. */
  pack?: PackSize
  /** A weighed amount in g or ml: opens on per kg and shows what it costs. */
  weighed?: number
  /** The last Price paid here (per pack). */
  last?: { cents: number; date: string } | null
  shopName: string
  /** True while another row has no Price: the primary is "Next without a Price", else "Save". */
  hasNext: boolean
  onNext: (entry: PriceEntry) => void
  onSave: (entry: PriceEntry) => void
  onClose: (entry: PriceEntry) => void
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/**
 * The keypad of the Price entry: our own keys only, uncontrolled. It keeps the typed text and reports a PriceEntry.
 * A physical keyboard types into it too, unless the focus is in another text field.
 */
export function PriceKeypad({ productName, currency, locale = 'en-US', initialCents, initialPerKgCents, pack, weighed, last, shopName, hasNext, onNext, onSave, onClose }: PriceKeypadProps) {
  const perKgPack = pack && supportsPerKg(pack.unit) ? pack : null
  const errorId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  /** Set while one Escape is being handled, so its keydown and a host dialog's `cancel` close the keypad only once. */
  const closedThisPress = useRef(false)
  const openingBasis: PriceBasis = perKgPack && weighed !== undefined ? 'perKg' : 'pack'
  const [basis, setBasis] = useState<PriceBasis>(openingBasis)
  const [typed, setTyped] = useState(() => openingText())
  const [refused, setRefused] = useState(false)

  /** A pack Price (minor units) as the typed text of a basis. */
  function valueIn(packCents: number | null, which: PriceBasis): string {
    if (packCents === null) return ''
    const converted = which === 'perKg' && perKgPack ? perKgFromPack(packCents, perKgPack.amount, perKgPack.unit) : packCents
    return converted === null ? '' : typedFromMinor(converted, currency)
  }

  /** The prefill: a per kg Price as it is when opening on per kg, else the pack Price in the opening basis. */
  function openingText(): string {
    if (perKgPack && initialPerKgCents != null && initialPerKgCents > 0) {
      if (openingBasis === 'perKg') return typedFromMinor(initialPerKgCents, currency)
      if (initialCents == null) return valueIn(packFromPerKg(initialPerKgCents, perKgPack.amount, perKgPack.unit), 'pack')
    }
    return valueIn(initialCents ?? null, openingBasis)
  }

  const cents = typedToMinor(typed, currency)
  // A per kg Price whose pack Price rounds to 0 (€0.01/kg for 100 g) is refused like 0: the server needs a pack Price above 0.
  const packOfPerKg = basis === 'perKg' && perKgPack && cents !== null ? packFromPerKg(cents, perKgPack.amount, perKgPack.unit) : null
  const valid = cents !== null && cents > 0 && (packOfPerKg === null || packOfPerKg > 0)

  function entry(): PriceEntry {
    if (!valid) return { basis, cents: null, packCents: null, perKgCents: null }
    if (packOfPerKg !== null) return { basis, cents, packCents: packOfPerKg, perKgCents: cents }
    return { basis: 'pack', cents, packCents: cents, perKgCents: null }
  }

  function press(next: string) {
    setTyped(next)
    setRefused(false)
  }

  /** Save or Next. A typed 0 (or a per kg Price whose pack Price is 0) is refused on the display, nothing is reported. */
  function commit() {
    if (cents !== null && !valid) return setRefused(true)
    if (hasNext) onNext(entry())
    else onSave(entry())
  }

  function switchBasis(next: PriceBasis) {
    if (next === basis || !perKgPack) return
    if (valid) {
      const converted = next === 'perKg' ? perKgFromPack(cents, perKgPack.amount, perKgPack.unit) : packFromPerKg(cents, perKgPack.amount, perKgPack.unit)
      setTyped(converted === null ? '' : typedFromMinor(converted, currency))
    }
    setBasis(next)
    setRefused(false)
  }

  /** Escape or the host dialog's close request: Close, reported at most once per event dispatch. */
  function closeByKey() {
    if (closedThisPress.current) return
    closedThisPress.current = true
    queueMicrotask(() => {
      closedThisPress.current = false
    })
    onClose(entry())
  }

  // The keys follow the keyboard while this is mounted. Enter on a focused button is that button's click, not a confirm.
  // Escape belongs to the keypad, because only it holds what was typed (Close saves a valid entry): it is handled once
  // and cancelled, which stops a host <dialog>'s own close request; a host dialog's `cancel` (Escape, Android back) is
  // caught before the dialog sees it and becomes the keypad's Close. So the host closes the sheet from onClose only.
  useEffect(() => {
    const inOtherDialog = (node: EventTarget | null) => {
      const dialog = node instanceof Element ? node.closest('dialog') : null
      return dialog !== null && !dialog.contains(rootRef.current)
    }
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (inOtherDialog(target)) return
      if (target?.matches?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
      if (/^[0-9]$/.test(e.key)) return press(pressDigit(typed, e.key, currency))
      if (e.key === '.' || e.key === ',') return press(pressDecimal(typed, currency))
      if (e.key === 'Backspace') return press(pressBackspace(typed))
      if (e.key === 'Enter' && !(target instanceof HTMLButtonElement)) {
        e.preventDefault()
        return commit()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeByKey()
      }
    }
    const onCancel = (e: Event) => {
      if (!(e.target instanceof HTMLDialogElement) || !e.target.contains(rootRef.current)) return
      e.preventDefault()
      e.stopPropagation()
      closeByKey()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('cancel', onCancel, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('cancel', onCancel, true)
    }
  })

  const separator = decimalSeparator(currency, locale) ?? '.'
  const implied = impliedLine({ basis, cents: valid ? cents : null, packCents: entry().packCents, pack: pack, weighed, currency, locale })

  return (
    <div ref={rootRef} className="price-keypad">
      <p className="price-keypad__meta">{productName}</p>
      {perKgPack ? (
        <Segmented<PriceBasis> label={uiStrings.priceBasis} labelHidden options={priceBasisOptions(perKgPack.unit)} value={basis} onChange={switchBasis} compact />
      ) : null}
      <output className="price-keypad__display" aria-live="polite" aria-label={uiStrings.priceOf(productName)} aria-describedby={refused ? errorId : undefined}>
        {formatTyped(typed, currency, locale)}
      </output>
      {refused ? (
        <p id={errorId} role="alert" className="price-keypad__error">
          {uiStrings.enterAbove0}
        </p>
      ) : null}
      {implied ? <p className="price-keypad__implied">{implied}</p> : null}
      {last ? (
        <Chip kind="tag" onClick={() => press(valueIn(last.cents, basis))}>
          {lastPriceHint({ cents: last.cents, date: last.date, currency, locale })}
        </Chip>
      ) : (
        <p className="price-keypad__hint">{noPriceHint(shopName)}</p>
      )}
      <div role="group" aria-label={uiStrings.keypad} className="price-keypad__keys">
        {DIGITS.map((d) => (
          <button key={d} type="button" className="price-keypad__key" onClick={() => press(pressDigit(typed, d, currency))}>
            {d}
          </button>
        ))}
        {hasDecimalKey(currency) ? (
          <button type="button" className="price-keypad__key" aria-label={uiStrings.decimalKey} onClick={() => press(pressDecimal(typed, currency))}>
            {separator}
          </button>
        ) : (
          <span className="price-keypad__key-gap" aria-hidden="true" />
        )}
        <button type="button" className="price-keypad__key" onClick={() => press(pressDigit(typed, '0', currency))}>
          0
        </button>
        <button type="button" className="price-keypad__key" aria-label={uiStrings.backspace} onClick={() => press(pressBackspace(typed))}>
          <Icon name="backspace" size={20} />
        </button>
      </div>
      <div className="price-keypad__actions">
        <Button variant="tertiary" onClick={() => onClose(entry())}>
          {uiStrings.close}
        </Button>
        {hasNext ? (
          <Button onClick={commit}>
            {uiStrings.nextWithoutPrice} <Icon name="next" size={20} />
          </Button>
        ) : (
          <Button onClick={commit}>{uiStrings.save}</Button>
        )}
      </div>
    </div>
  )
}
