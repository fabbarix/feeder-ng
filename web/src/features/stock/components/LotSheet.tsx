import { useState, type ReactElement } from 'react'
import { BottomSheet, Button, FormActions, Select, TextField } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { capitalise, formatLotDate } from '../lib/display'
import { checkMoveQuantity, moveNote } from '../lib/move'
import { describeGoOff } from '../lib/view'
import { stockStrings as strings } from '../strings'
import type { StockLot, StoragePlace } from '../types'

export interface LotSheetProps {
  lot: StockLot | null
  places: StoragePlace[]
  today: string
  system?: UnitSystem
  onClose: () => void
  /** Moves it, or `quantity` of it, to a Storage Place. */
  onMove: (lot: StockLot, placeId: number, quantity: number | undefined) => void
  /** Opens the Ingredient's own sheet (all its Lots, Set total). */
  onSeeIngredient: (ingredientId: number) => void
  /**
   * Beta.5: "Edit" (secondary button) asks the screen to open the LotEditSheet for the Lot. The sheet closes itself first
   * through onClose.
   */
  onEdit?: (lot: StockLot) => void
  /**
   * Beta.5: "Delete" (danger tertiary button) asks first in our own confirm dialog (useConfirm, `tone: 'danger'`, title
   * strings.deleteTitle, body strings.deleteBody, or strings.deleteBodyWentOff when the Lot has gone off, confirm label
   * "Delete"); only the confirm calls onDelete.
   */
  onDelete?: (lot: StockLot) => void
}

/** One Stock Lot: where it is, when it was bought, how long it is good, and "Move to" another Storage Place (all or part). */
export function LotSheet({ lot, places, today, system = 'metric', onClose, onMove, onSeeIngredient }: LotSheetProps): ReactElement {
  return (
    <BottomSheet open={lot !== null} onClose={onClose} title={lot ? capitalise(lot.ingredientName) : ''}>
      {lot ? <LotDetail key={lot.id} lot={lot} places={places} today={today} system={system} onMove={onMove} onSeeIngredient={onSeeIngredient} /> : null}
    </BottomSheet>
  )
}

function LotDetail({ lot, places, today, system = 'metric', onMove, onSeeIngredient }: Omit<LotSheetProps, 'lot' | 'onClose'> & { lot: StockLot }) {
  const from = places.find((p) => p.id === lot.storagePlaceId) ?? null
  const [placeId, setPlaceId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const to = places.find((p) => p.id === placeId) ?? null
  const note = moveNote(from, to)
  const all = formatQuantity(lot.quantity, lot.baseUnit, system)
  const options = places.filter((p) => p.id !== lot.storagePlaceId).map((p) => ({ value: p.id, label: p.name, meta: strings.kinds[p.kind] }))
  return (
    <div className="pg__stack">
      <p className="lot-sheet__facts">
        {all} · {describeGoOff(lot, today).label}
        <br />
        {from ? strings.inPlace(from.name) : strings.unsorted} · {strings.boughtOn(formatLotDate(lot.purchased))}
      </p>
      {options.length > 0 ? (
        <form
          className="pg__stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (placeId === null) return
            const check = checkMoveQuantity(quantity, lot)
            if (!check.ok) {
              setError(check.error === 'tooMuch' ? strings.moveTooMuch : strings.errors[check.error])
              return
            }
            onMove(lot, placeId, check.quantity)
          }}
        >
          <h3 className="lot-sheet__heading">{strings.moveTitle}</h3>
          <Select<number> label={strings.moveTo} entityName="Storage Place" options={options} value={placeId} onChange={setPlaceId} />
          <TextField
            label={strings.moveSome}
            inputMode="decimal"
            value={quantity}
            placeholder={String(lot.quantity)}
            onChange={(v) => {
              setQuantity(v)
              setError(null)
            }}
            suffix={lot.baseUnit}
            helper={strings.moveSomeHint(all)}
            error={error ?? undefined}
          />
          {note ? <p className="pg__muted">{note === 'freezer' ? strings.freezerNote : strings.thawNote}</p> : null}
          <FormActions
            secondary={
              <Button variant="tertiary" onClick={() => onSeeIngredient(lot.ingredientId)}>
                {strings.seeIngredient(lot.ingredientName)}
              </Button>
            }
            primary={
              <Button type="submit" disabled={placeId === null}>
                {strings.move}
              </Button>
            }
          />
        </form>
      ) : (
        <>
          <p className="pg__muted">{strings.noPlacesHint}</p>
          <Button variant="tertiary" onClick={() => onSeeIngredient(lot.ingredientId)}>
            {strings.seeIngredient(lot.ingredientName)}
          </Button>
        </>
      )}
    </div>
  )
}
