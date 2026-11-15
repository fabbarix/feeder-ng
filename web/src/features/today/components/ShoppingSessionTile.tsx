import { useId, type ReactElement } from 'react'
import { Button, Tile, TileHeader } from '../../../ui'
import { shoppingMeta, shoppingTitle } from '../lib/shopping'
import { todayStrings as s } from '../strings'
import '../today.css'

export interface ShoppingSessionTileProps {
  session: { shopName: string; scanned: number; lastScanAt: number }
  linesToGet: number
  /** The clock the "last Scan 4 min ago" is read by (it moves each minute, without being announced). */
  now: Date
  /** Back to Scan (primary): Scan opens on that Shop. */
  onBack: () => void
  /** Done shopping (secondary): ends the session and keeps the Scanned list. */
  onDone: () => void
}

/**
 * B9-44 (TB-12, decision TB 5): "Shopping at Coop", a full-row soft tile first on Today while this phone has an active Scan session: the
 * shared header (a basket badge, no count), the meta "7 scanned · 11 Lines to get · last Scan 4 min ago", Back to Scan and Done shopping.
 */
export function ShoppingSessionTile({ session, linesToGet, now, onBack, onDone }: ShoppingSessionTileProps): ReactElement {
  const titleId = useId()
  return (
    <Tile as="section" variant="soft" span="full" aria-labelledby={titleId} className="shopping-session">
      <TileHeader icon="shop" title={shoppingTitle(session.shopName)} titleId={titleId} />
      <p className="shopping-session__meta">{shoppingMeta(session, linesToGet, now)}</p>
      <div className="shopping-session__actions">
        <Button variant="primary" icon="scan" onClick={onBack}>
          {s.shoppingBack}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {s.shoppingDone}
        </Button>
      </div>
    </Tile>
  )
}
