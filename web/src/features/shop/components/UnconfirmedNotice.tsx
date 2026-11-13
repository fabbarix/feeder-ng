// DS-SHOP (docs/design/system.md §3, §9): the one notice for unconfirmed past meals, above the list, in the info tone. The slots
// are in bold; the sentence is clamped to two lines (the full text is its title). "Mark it" is secondary: the accent is for Scan.
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
      <p className="shop-notice__text" title={notice.text}>
        {notice.segments.map((segment, i) => (segment.strong ? <strong key={i}>{segment.text}</strong> : <span key={i}>{segment.text}</span>))}
      </p>
      {onMarkIt ? (
        <Button variant="secondary" size="sm" onClick={() => onMarkIt(notice.markIt)}>
          {shopStrings.markIt}
        </Button>
      ) : null}
    </Tile>
  )
}
