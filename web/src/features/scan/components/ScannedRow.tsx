// SR4: one Product of the Scanned list, a ListRow (shop-scan-proposals.md 13.3, as changed after the mockup review). It shows
// the Thumb, the name (without the pack size), the second line (the size, then one tick and "x of y" when it is on the
// Shopping List, or a clock while it waits to sync) and the Price with "×2 · €1.29", or "Add price". The active row (tapped)
// keeps that top part and adds one strip under it: the Stepper (not for a weighed row), then Price and Remove. Render only:
// the states come from lib/scannedList.
import { Button } from '../../../ui/Button'
import { Icon } from '../../../ui/Icon'
import { ListRow, type ListRowProps } from '../../../ui/ListRow'
import { Stepper } from '../../../ui/Stepper'
import { Thumb } from '../../../ui/Thumb'
import type { UnitSystem } from '../../../lib/units'
import { formatMinor } from '../../products/lib/money'
import { rowAmounts, rowMeta, rowTitle, type RowMeta, type ScannedRow as Row } from '../lib/scannedList'
import { scanStrings } from '../strings'

export interface ScannedRowProps {
  row: Row
  currency: string
  system: UnitSystem
  /** the row is tapped: its strip (Stepper, Price, Remove) shows */
  active: boolean
  /** the Price entry is open on this row: it is outlined */
  pricing: boolean
  onActivate: () => void
  onPrice: () => void
  onIncrement: () => void
  onDecrement: () => void
  onRemove: () => void
}

/** The second line: the size, then one tick (filled once the Line is covered, hollow before) and "x of y", or the clock. */
function MetaLine({ meta }: { meta: RowMeta }) {
  const after = meta.cover ? (
    <>
      <Icon name={meta.cover.done ? 'success' : 'successOpen'} size={14} weight={meta.cover.done ? 'fill' : 'bold'} className="scanned-row__tick" />
      <span>{meta.cover.text}</span>
    </>
  ) : meta.waiting ? (
    <>
      <Icon name="duration" size={14} />
      <span>{scanStrings.waitingToSync}</span>
    </>
  ) : null
  return (
    <span className="scanned-row__meta">
      {meta.size ? <span>{meta.size}</span> : null}
      {meta.size && after ? <span aria-hidden="true">·</span> : null}
      {after}
    </span>
  )
}

type StripProps = Pick<ScannedRowProps, 'row' | 'onPrice' | 'onIncrement' | 'onDecrement' | 'onRemove'>

/** The active row's strip: the compact Stepper on the left (a weighed row has none), Price and Remove on the right. */
function ActiveStrip({ row, onPrice, onIncrement, onDecrement, onRemove }: StripProps) {
  return (
    <div className="scanned-row__strip">
      {row.weighed ? (
        <span />
      ) : (
        <Stepper value={row.count} onChange={(next) => (next > row.count ? onIncrement() : onDecrement())} label={scanStrings.quantityOf(row.name)} size="xs" />
      )}
      <span className="scanned-row__actions">
        <Button variant="tertiary" size="sm" aria-label={`${scanStrings.priceOf(row.name)}…`} onClick={onPrice}>
          {scanStrings.priceAction}
        </Button>
        <Button variant="danger-tertiary" size="sm" aria-label={scanStrings.removeProduct(row.name)} onClick={onRemove}>
          {scanStrings.removeAction}
        </Button>
      </span>
    </div>
  )
}

export function ScannedRow({ row, currency, system, active, pricing, onActivate, onPrice, onIncrement, onDecrement, onRemove }: ScannedRowProps) {
  const amounts = rowAmounts(row, (cents: number) => formatMinor(cents, currency))
  const props: ListRowProps = {
    title: rowTitle(row, system),
    'aria-label': row.name,
    onActivate,
    leading: <Thumb name={row.name} imageUrl={row.imageUrl} size={48} />,
    meta: <MetaLine meta={rowMeta(row, system)} />,
    value:
      amounts.value === null ? (
        <Button variant="secondary" size="sm" icon="add" className="scanned-row__add" onClick={onPrice}>
          {scanStrings.addPrice}
        </Button>
      ) : (
        amounts.value
      ),
    subValue: amounts.sub,
    footer: active ? <ActiveStrip row={row} onPrice={onPrice} onIncrement={onIncrement} onDecrement={onDecrement} onRemove={onRemove} /> : undefined,
    'data-active': active ? 'true' : undefined,
    'data-pricing': pricing ? 'true' : undefined,
  }
  return <ListRow {...props} />
}
