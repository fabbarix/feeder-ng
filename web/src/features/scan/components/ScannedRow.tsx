// SR4: one Product of the Scanned list, a ListRow (shop-scan-proposals.md 13.3). It shows the Thumb, the name (without the
// pack size), the second line (the size, then one tick and "x of y" when it is on the Shopping List, or a clock while it waits
// to sync) and the Price, or "Add price". The active row (tapped) shows the Stepper and the ⋮ menu. Render only: the states
// come from lib/scannedList.
import { Icon } from '../../../ui/Icon'
import { ListRow, type ListRowProps } from '../../../ui/ListRow'
import { Menu, type MenuEntry } from '../../../ui/Menu'
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
  /** the row is tapped: its Stepper and menu show */
  active: boolean
  /** the Price entry is open on this row: it is outlined */
  pricing: boolean
  onActivate: () => void
  onPrice: () => void
  onIncrement: () => void
  onDecrement: () => void
  onRemove: () => void
  /** given when the screen can open the Product (a row with a Product) */
  onOpenProduct?: () => void
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

export function ScannedRow({ row, currency, system, active, pricing, onActivate, onPrice, onIncrement, onDecrement, onRemove, onOpenProduct }: ScannedRowProps) {
  const money = (cents: number) => formatMinor(cents, currency)
  const meta = rowMeta(row, system)
  const amounts = rowAmounts(row, money)
  const showStepper = active && !row.weighed
  const priceControl =
    amounts.value === null ? (
      <button type="button" className="scanned-row__add" onClick={onPrice}>
        {scanStrings.addPrice}
      </button>
    ) : (
      <button type="button" className="scanned-row__price" aria-label={`${scanStrings.priceOf(row.name)}…`} onClick={onPrice}>
        {amounts.value}
      </button>
    )
  const menu: MenuEntry[] = [{ id: 'remove', label: scanStrings.removeAction, icon: 'delete', tone: 'danger', onSelect: onRemove }]
  if (onOpenProduct) menu.push({ id: 'product', label: scanStrings.openProduct, icon: 'products', onSelect: onOpenProduct })
  const props: ListRowProps = {
    title: rowTitle(row, system),
    'aria-label': row.name,
    onActivate,
    leading: <Thumb name={row.name} imageUrl={row.imageUrl} size={48} />,
    meta: <MetaLine meta={meta} />,
    value: (
      <>
        {priceControl}
        {showStepper ? <Stepper value={row.count} onChange={(next) => (next > row.count ? onIncrement() : onDecrement())} label={scanStrings.quantityOf(row.name)} size="sm" /> : null}
      </>
    ),
    subValue: showStepper ? undefined : amounts.sub,
    trailing: active ? <Menu label={scanStrings.moreFor(row.name)} items={menu} /> : undefined,
    'data-active': active ? 'true' : undefined,
    'data-pricing': pricing ? 'true' : undefined,
  }
  return <ListRow {...props} />
}
