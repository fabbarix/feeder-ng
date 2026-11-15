import { useId, useState, type ReactElement } from 'react'
import { BottomSheet, Button, FormActions, Muted, Select, Stack, TextField, useConfirm } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { capitalise, formatLotDate } from '../lib/display'
import { checkMoveQuantity, lotMoveNote } from '../lib/move'
import { checkUsedUp, isSupply } from '../lib/supplies'
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
  /**
   * H6: "Used up" of a Supply's Lot: `used` is the amount typed, or undefined for the whole Lot. Only a Supply shows the section.
   * The screen closes the sheet and does the change (never waste).
   */
  onUsedUp?: (lot: StockLot, used: number | undefined) => void
}

/**
 * One Stock Lot: where it is, when it was bought, how long it is good; Edit, Delete, and (SAFE-11) "Move…", a disclosure that reveals
 * "Move to" another Storage Place (all or part), offered only when there is another place. "All <Ingredient>" is always there.
 */
export function LotSheet({ lot, places, today, system = 'metric', onClose, onMove, onSeeIngredient, onEdit, onDelete, onUsedUp }: LotSheetProps): ReactElement {
  // Edit closes this sheet first: the screen opens the edit sheet in its place.
  const edit = onEdit ? (l: StockLot) => {
    onClose()
    onEdit(l)
  } : undefined
  return (
    <BottomSheet open={lot !== null} onClose={onClose} title={lot ? capitalise(lot.ingredientName) : ''}>
      {lot ? (
        <LotDetail key={lot.id} lot={lot} places={places} today={today} system={system} onMove={onMove} onSeeIngredient={onSeeIngredient} onEdit={edit} onDelete={onDelete} onUsedUp={onUsedUp} />
      ) : null}
    </BottomSheet>
  )
}

/** The words of a refused "Used up" amount. */
const usedUpErrors = { tooMuch: strings.moveTooMuch, notPositive: strings.errors.notPositive, negative: strings.errors.negative, invalid: strings.errors.invalid } as const

function LotDetail({ lot, places, today, system = 'metric', onMove, onSeeIngredient, onEdit, onDelete, onUsedUp }: Omit<LotSheetProps, 'lot' | 'onClose'> & { lot: StockLot }) {
  const { confirm: ask } = useConfirm()
  const from = places.find((p) => p.id === lot.storagePlaceId) ?? null
  const supply = isSupply(lot)
  const askDelete = async () => {
    const sure = await ask({
      title: strings.deleteTitle,
      body: supply ? strings.deleteBodySupply : lot.spoiled ? strings.deleteBodyWentOff : strings.deleteBody,
      confirmLabel: strings.delete,
      tone: 'danger',
    })
    if (sure) onDelete?.(lot)
  }
  const [moving, setMoving] = useState(false)
  const [usedAmount, setUsedAmount] = useState('')
  const [usedError, setUsedError] = useState<string | null>(null)
  const moveId = useId()
  const all = formatQuantity(lot.quantity, lot.baseUnit, system)
  const options = places.filter((p) => p.id !== lot.storagePlaceId).map((p) => ({ value: p.id, label: p.name, meta: strings.kinds[p.kind] }))
  // SAFE-11: Move is offered only when there is somewhere to move to, and its form shows once Move… is pressed.
  const canMove = options.length > 0
  return (
    <Stack>
      <p className="lot-sheet__facts">
        {supply ? all : `${all} · ${describeGoOff(lot, today).label}`}
        <br />
        {from ? strings.inPlace(from.name) : strings.unsorted} · {strings.boughtOn(formatLotDate(lot.purchased))}
      </p>
      <div className="lot-sheet__see">
        <Button variant="secondary" size="sm" icon="ingredients" onClick={() => onSeeIngredient(lot.ingredientId)}>
          {strings.seeIngredient(lot.ingredientName)}
        </Button>
      </div>
      {!canMove && places.length === 0 ? <Muted>{strings.noPlacesHint}</Muted> : null}
      {onEdit || onDelete || canMove ? (
        <FormActions
          destructive={
            onDelete ? (
              <Button variant="danger-secondary" onClick={() => void askDelete()}>
                {strings.delete}
              </Button>
            ) : undefined
          }
          secondary={
            canMove ? (
              <Button variant="secondary" aria-expanded={moving} aria-controls={moving ? moveId : undefined} onClick={() => setMoving((m) => !m)}>
                {strings.moveDisclosure}
              </Button>
            ) : undefined
          }
          primary={
            onEdit ? (
              <Button variant="secondary" onClick={() => onEdit(lot)}>
                {strings.edit}
              </Button>
            ) : null
          }
        />
      ) : null}
      {canMove && moving ? <MoveForm id={moveId} lot={lot} from={from} places={places} options={options} all={all} onMove={onMove} /> : null}
      {supply && onUsedUp ? (
        <>
          <h3 className="lot-sheet__heading">{strings.usedUp.heading}</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const check = checkUsedUp(usedAmount, lot)
              if (!check.ok) {
                setUsedError(usedUpErrors[check.error])
                return
              }
              onUsedUp(lot, check.used)
            }}
          >
            <Stack>
              <TextField
                label={strings.usedUp.amount}
                inputMode="decimal"
                value={usedAmount}
                placeholder={String(lot.quantity)}
                suffix={lot.baseUnit}
                onChange={(v) => {
                  setUsedAmount(v)
                  setUsedError(null)
                }}
                helper={strings.usedUp.hint(all)}
                error={usedError ?? undefined}
              />
              <FormActions primary={<Button type="submit">{strings.usedUp.button}</Button>} />
            </Stack>
          </form>
        </>
      ) : null}
    </Stack>
  )
}

interface MoveFormProps {
  id: string
  lot: StockLot
  from: StoragePlace | null
  places: StoragePlace[]
  options: { value: number; label: string; meta: string }[]
  all: string
  onMove: LotSheetProps['onMove']
}

/** "Move to": a Storage Place and how much (all of it by default). Move is never disabled; it says what is missing. */
function MoveForm({ id, lot, from, places, options, all, onMove }: MoveFormProps) {
  const [placeId, setPlaceId] = useState<number | null>(null)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const to = places.find((p) => p.id === placeId) ?? null
  const note = lotMoveNote(lot, from, to)
  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault()
        if (placeId === null) {
          setPlaceError(strings.movePlaceNeeded)
          return
        }
        const check = checkMoveQuantity(quantity, lot)
        if (!check.ok) {
          setError(check.error === 'tooMuch' ? strings.moveTooMuch : strings.errors[check.error])
          return
        }
        onMove(lot, placeId, check.quantity)
      }}
    >
      <Stack>
        <h3 className="lot-sheet__heading">{strings.moveTitle}</h3>
        {/* b8-polish: until a new place is chosen the field shows the hint; the sheet already says where the Lot is. */}
        <Select<number>
          label={strings.moveTo}
          entityName="Storage Place"
          options={options}
          value={placeId}
          onChange={(v) => {
            setPlaceId(v)
            setPlaceError(null)
          }}
          placeholder={strings.chooseStoragePlace}
          error={placeError ?? undefined}
        />
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
        {note ? <Muted>{note === 'freezer' ? strings.freezerNote : strings.thawNote}</Muted> : null}
        <FormActions primary={<Button type="submit">{strings.move}</Button>} />
      </Stack>
    </form>
  )
}
