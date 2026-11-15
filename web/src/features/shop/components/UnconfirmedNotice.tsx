// DS-SHOP (docs/design/system.md §3, §9): the one notice for unconfirmed past meals, above the list, in the info tone. B9-43 (SSP-04): the
// predicate is the title ("Not marked Cooked yet") with a round count chip; the slots are a meta line under it, which may clamp to two
// lines (the title never is cut: it wraps). Nothing is set bold. "Mark it" is secondary (the accent is for Scan); it sits under the text on
// a narrow tile and at the end from 26 rem (a container query in shop.css).
import { useId } from 'react'
import { Button } from '../../../ui/Button'
import { Icon } from '../../../ui/Icon'
import { Tile } from '../../../ui/Tile'
import type { UnconfirmedNotice as Notice } from '../lib/notice'
import { shopStrings } from '../strings'

export interface UnconfirmedNoticeProps {
  notice: Pick<Notice, 'title' | 'slots' | 'count' | 'markIt'>
  /** "Mark it": opens the oldest unconfirmed slot on the Plan. Without it the notice is the title and the slots only. */
  onMarkIt?: (slot: Notice['markIt']) => void
}

export function UnconfirmedNotice({ notice, onMarkIt }: UnconfirmedNoticeProps) {
  const titleId = useId()
  return (
    <Tile as="section" variant="status" status="info" className="shop-notice" aria-labelledby={titleId}>
      <div className="shop-notice__body">
        <Icon name="info" size={20} />
        <div className="shop-notice__text">
          <p className="shop-notice__title" id={titleId}>
            <span>{notice.title}</span>
            <span className="shop-notice__count">
              {notice.count}
              <span className="visually-hidden">{shopStrings.slotsToMark(notice.count)}</span>
            </span>
          </p>
          <p className="shop-notice__slots">{notice.slots.map((s) => s.text).join('')}</p>
        </div>
        {onMarkIt ? (
          <Button variant="secondary" size="sm" onClick={() => onMarkIt(notice.markIt)}>
            {shopStrings.markIt}
          </Button>
        ) : null}
      </div>
    </Tile>
  )
}
