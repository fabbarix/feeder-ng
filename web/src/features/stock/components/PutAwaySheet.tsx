// B9-29 (SSP-10, mock ssp-10-put-away.html): Put away the Not sorted Stock Lots, many at once, into one Storage Place.
// Render and wiring only: the rules are lib/putAway, the request is usePutAway (the screen passes it as onMove).
import { useId, useRef, useState, type ReactElement } from 'react'
import { BottomSheet, Button, Checkbox, Icon, ListGroup, ListRow, Select, Thumb } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { errorText } from '../../products/lib/productForm'
import { capitalise } from '../lib/display'
import { KIND_ICON } from '../lib/kinds'
import { afterMove, defaultPutAwayPlace, movedStatus, moveLabel, putAwayMoves, putAwayTitle, toggleLot, type PutAwayMove, type PutAwayResult } from '../lib/putAway'
import { isSupply, supplyRestockMeta, type Restock } from '../lib/supplies'
import { describeGoOff } from '../lib/view'
import { stockStrings as strings } from '../strings'
import type { StockLot, StoragePlace } from '../types'

export interface PutAwaySheetProps {
  open: boolean
  onClose: () => void
  /** The Not sorted Stock Lots. The sheet keeps its own list while open: moved and skipped Lots leave it. */
  lots: StockLot[]
  places: StoragePlace[]
  today: string
  system?: UnitSystem
  /** One request for every ticked Lot (usePutAway().putAway). */
  onMove: (moves: PutAwayMove[]) => Promise<PutAwayResult>
  /** Called once, after the sheet closed itself, when the last Lot has left the list. */
  onAllPutAway?: () => void
  /** A Supply's Restock level and Stock, for its row's meta (as on the Pantry row). */
  restockFor?: (ingredientId: number) => Restock | null
}

export function PutAwaySheet({ open, onClose, lots, places, today, system = 'metric', onMove, onAllPutAway, restockFor }: PutAwaySheetProps): ReactElement {
  const [list, setList] = useState<StockLot[]>(lots)
  const [wasOpen, setWasOpen] = useState(open)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [lastUsed, setLastUsed] = useState<number | null>(null)
  const [placeId, setPlaceId] = useState<number | null>(() => defaultPutAwayPlace(places, null))
  const [status, setStatus] = useState('')
  const [fieldLine, setFieldLine] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const lineId = useId()
  // Opening again starts from the Lots the screen has now; the place last used in this sheet stays the first choice.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setList(lots)
      setSelected(new Set())
      setPlaceId(defaultPutAwayPlace(places, lastUsed))
      setStatus('')
      setFieldLine(null)
      setError(null)
    }
  }
  const chosen = places.find((p) => p.id === placeId) ?? null
  const count = list.filter((l) => selected.has(l.id)).length
  const primary = chosen ? (count === 0 ? strings.putAway.moveTo(chosen.name) : moveLabel(count, chosen.name)) : strings.move

  const move = async () => {
    if (busy) return
    if (count === 0 || chosen === null) {
      setFieldLine(strings.putAway.tickOne)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await onMove(putAwayMoves(list, selected, chosen.id))
      const rest = afterMove(list, result)
      setLastUsed(chosen.id)
      setList(rest)
      setSelected(new Set())
      setStatus(movedStatus(result.lots.length, chosen.name))
      if (rest.length === 0) {
        onClose()
        onAllPutAway?.()
        return
      }
      // The next row to sort takes the focus, once the moved rows are gone.
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={putAwayTitle(list.length)}
      footer={
        <div className="put-away__actions">
          {fieldLine ? (
            <p id={lineId} className="ui-field__error put-away__line">
              {fieldLine}
            </p>
          ) : null}
          <Button block="always" loading={busy} aria-describedby={fieldLine ? lineId : undefined} onClick={() => void move()}>
            {primary}
          </Button>
        </div>
      }
    >
      <div className="put-away">
        <Select<number>
          label={strings.putAway.into}
          size="full"
          entityName="Storage Place"
          options={places.map((p) => ({ value: p.id, label: p.name, meta: strings.kinds[p.kind], leading: <Icon name={KIND_ICON[p.kind]} size={20} /> }))}
          value={placeId}
          onChange={(id) => {
            setPlaceId(id)
            setError(null)
          }}
          placeholder={strings.chooseStoragePlace}
        />
        <p className="put-away__hint">{strings.putAway.hint}</p>
        {/* The result of the last move, said politely; empty (and taking no line) until something moved. */}
        <p role="status" className="put-away__status" data-empty={status === '' || undefined}>
          {status}
        </p>
        <FormError>{error}</FormError>
        <div ref={listRef}>
          <ListGroup label={strings.unsorted}>
            {list.map((lot) => {
              const ticked = selected.has(lot.id)
              const name = capitalise(lot.ingredientName)
              const goOff = isSupply(lot) ? null : describeGoOff(lot, today)
              const supply = isSupply(lot) ? supplyRestockMeta(restockFor?.(lot.ingredientId) ?? null, lot.baseUnit, system) : null
              return (
                <ListRow
                  key={lot.id}
                  data-put-away-row=""
                  title={name}
                  selected={ticked}
                  control={
                    <Checkbox
                      label={name}
                      checked={ticked}
                      onChange={() => {
                        setSelected((s) => toggleLot(s, lot.id))
                        setFieldLine(null)
                      }}
                    />
                  }
                  leading={<Thumb name={lot.ingredientName} imageUrl={lot.ingredientImageUrl} size={40} />}
                  meta={goOff ? goOff.label : supply?.long}
                  metaCompact={supply?.compact || undefined}
                  metaStatus={goOff?.tone === 'spoil' ? 'spoil' : supply?.below ? 'info' : undefined}
                  metaIcon={goOff?.tone === 'spoil' ? (lot.spoiled ? 'spoiled' : 'useSoon') : undefined}
                  value={formatQuantity(lot.quantity, lot.baseUnit, system)}
                />
              )
            })}
          </ListGroup>
        </div>
      </div>
    </BottomSheet>
  )
}
