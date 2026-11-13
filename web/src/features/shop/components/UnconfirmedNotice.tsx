// DS-SHOP (docs/design/system.md §3, §9): the one notice for unconfirmed past meals, above the list, in the info tone.
// "Mark it" is a secondary action: the accent is for Scan only. Render only.
import { Button } from '../../../ui/Button'
import { Icon } from '../../../ui/Icon'
import { Tile } from '../../../ui/Tile'
import type { UnconfirmedNotice as Notice } from '../lib/notice'
import { shopStrings } from '../strings'

export interface UnconfirmedNoticeProps {
  notice: Notice
  /** "Mark it": opens the oldest unconfirmed slot on the Plan. Without it the notice is the sentence only. */
  onMarkIt?: (slot: Notice['markIt']) => void
}

export function UnconfirmedNotice({ notice, onMarkIt }: UnconfirmedNoticeProps) {
  return (
    <Tile as="section" variant="status" status="info" className="shop-notice" aria-label={shopStrings.notMarkedTitle}>
      <Icon name="info" size={20} />
      <p className="shop-notice__text">{notice.text}</p>
      {onMarkIt ? (
        <Button variant="secondary" size="sm" onClick={() => onMarkIt(notice.markIt)}>
          {shopStrings.markIt}
        </Button>
      ) : null}
    </Tile>
  )
}
