// B9-44 (TB-11): the Pantry's Lot sheet over another screen (Today's Use soon rows): `<LotSheetHost lotId onClose />` reads the Lot, the
// Storage Places and the unit system itself, and its actions are the Pantry's (hooks/useLotSheetHost). Nothing for a null or gone Lot.
import type { ReactElement } from 'react'
import { useLotSheetHost } from '../hooks/useLotSheetHost'
import { LotEditSheet } from './LotEditSheet'
import { LotSheet } from './LotSheet'

export interface LotSheetHostProps {
  lotId: number | null
  onClose: () => void
}

export function LotSheetHost({ lotId, onClose }: LotSheetHostProps): ReactElement {
  const host = useLotSheetHost(lotId, onClose)
  return (
    <>
      <LotSheet
        lot={host.lot}
        places={host.places}
        today={host.today}
        system={host.system}
        onClose={onClose}
        onMove={host.move}
        onSeeIngredient={host.seeIngredient}
        onEdit={host.edit}
        onDelete={host.remove}
        onUsedUp={host.usedUp}
      />
      <LotEditSheet lot={host.editing} today={host.today} onClose={host.closeEdit} onSubmit={host.saveEdit} />
    </>
  )
}
