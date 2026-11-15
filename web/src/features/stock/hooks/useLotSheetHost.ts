// B9-44 (TB-11): the Pantry's Lot sheet opened away from the Pantry (Today's Use soon rows): the Lot of an id with the Storage Places and the
// unit system, and the sheet's actions wired as the Pantry wires them (Move, Edit, Delete, Used up), each with its toast; a failure shows
// the error toast. "All <Ingredient>" opens the Pantry on that Lot. React hook.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { capitalise } from '../lib/display'
import { stockStrings as strings } from '../strings'
import type { LotPatch, StockLot, StoragePlace } from '../types'
import { useAllLots, useStockActions, useStockTotals } from './useStock'
import { useStoragePlaces } from './useStoragePlaces'

export interface LotSheetHostState {
  /** The Lot to show; null while it loads, for no id, or when it is gone. */
  lot: StockLot | null
  places: StoragePlace[]
  today: string
  system: UnitSystem
  /** The Lot whose edit sheet is open (Edit closes the Lot sheet first). */
  editing: StockLot | null
  move: (lot: StockLot, placeId: number, quantity: number | undefined) => void
  seeIngredient: (ingredientId: number) => void
  edit: (lot: StockLot) => void
  closeEdit: () => void
  saveEdit: (lot: StockLot, patch: LotPatch) => void
  remove: (lot: StockLot) => void
  usedUp: (lot: StockLot, used: number | undefined) => void
}

export function useLotSheetHost(lotId: number | null, onClose: () => void): LotSheetHostState {
  const lots = useAllLots()
  const { places } = useStoragePlaces()
  const { system = 'metric' } = useStockTotals()
  const actions = useStockActions()
  const toast = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<StockLot | null>(null)
  const lot = lotId === null ? null : ((lots.data ?? []).find((l) => l.id === lotId) ?? null)
  const attempt = (change: () => Promise<void>) => {
    change().catch(() => toast.show(strings.actionFailed, { status: 'error' }))
  }
  return {
    lot,
    places,
    today: lots.today ?? '',
    system,
    editing,
    move: (l, placeId, quantity) => {
      onClose()
      const place = places.find((p) => p.id === placeId)
      attempt(async () => {
        await actions.moveLot(l.id, placeId, quantity)
        toast.show(strings.moved(l.ingredientName, place?.name ?? ''), { status: 'success' })
      })
    },
    seeIngredient: () => {
      const id = lotId
      onClose()
      navigate(id === null ? '/pantry' : `/pantry?lot=${id}`)
    },
    edit: (l) => setEditing(l),
    closeEdit: () => setEditing(null),
    saveEdit: (l, patch) => {
      setEditing(null)
      attempt(async () => {
        await actions.editLot(l.id, patch)
        toast.show(strings.edited(l.ingredientName), { status: 'success' })
      })
    },
    remove: (l) => {
      onClose()
      attempt(async () => {
        await actions.deleteLot(l.id)
        toast.show(strings.deleted(l.ingredientName), { status: 'success' })
      })
    },
    usedUp: (l, used) => {
      onClose()
      attempt(async () => {
        await actions.usedUp(l, used)
        toast.show(strings.usedUp.done(capitalise(l.ingredientName)), { status: 'success' })
      })
    },
  }
}
