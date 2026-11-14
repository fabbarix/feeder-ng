// The second line of a row on the Scan screen: the size, then one tick (filled once the Line is covered, hollow before) and
// "x of y", or the clock while the scan waits to sync. Shared by the Scanned row and the To get row. Render only.
import { Icon } from '../../../ui/Icon'
import { scanStrings } from '../strings'

export interface CoverMetaProps {
  /** the pack size ("125 g", "2 × Mutti 700 g"); '' when there is none */
  size: string
  /** the Shopping List Line it covers, "250 of 375 g", and whether that is all of it; null when not on the list */
  cover: { text: string; done: boolean } | null
  /** every scan still waits in the queue: the clock and "Waiting to sync" */
  waiting?: boolean
}

export function CoverMeta({ size, cover, waiting }: CoverMetaProps) {
  // The tick and its "x of y" (or the clock and its words) stay together when the line wraps.
  const after = cover ? (
    <span className="scanned-row__cover">
      <Icon name={cover.done ? 'success' : 'successOpen'} size={14} weight={cover.done ? 'fill' : 'bold'} className="scanned-row__tick" />
      <span>{cover.text}</span>
    </span>
  ) : waiting ? (
    <span className="scanned-row__cover">
      <Icon name="duration" size={14} />
      <span>{scanStrings.waitingToSync}</span>
    </span>
  ) : null
  return (
    <span className="scanned-row__meta">
      {size ? <span>{size}</span> : null}
      {size && after ? <span aria-hidden="true">·</span> : null}
      {after}
    </span>
  )
}
