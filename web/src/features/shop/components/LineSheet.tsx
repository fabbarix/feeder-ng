// DS-SHOP (docs/design/system.md §3): the sheet a row opens: what the Line is (quantity, pack, estimated cost, the full
// "not marked Cooked yet" sentence) and its rare actions. The tick stays on the row. Render only.
// B9-34 (SSP-18, mocks/ssp-18-ticked-sheet.html): a ticked entry's sheet is not a dead end: a state line, what the Line needed, the
// additions as R-E rows (each hand addition with its own Take back: anyone may take back any hand addition), then Change amount and
// Untick, and one note. The open Line's sheet (B9-43's) is unchanged here.
import { useEffect, useRef } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { Icon } from '../../../ui/Icon'
import type { IconName } from '../../../ui/icons'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { TickAddition } from '../types'
import type { LineAction } from '../lib/rows'
import type { ListEntry } from '../lib/lines'
import { additionDetail } from '../lib/tickAmount'
import { shopStrings } from '../strings'

export interface LineSheetProps {
  entry: ListEntry | null
  actions: LineAction[]
  onAction: (action: LineAction) => void
  onClose: () => void
  /** B9-34 ticked mode (SSP-18): the display system and the Household's IANA zone, for the amounts and times of the additions */
  system?: UnitSystem
  /** null/omitted while the zone is unknown: the additions show no time (never the device's) */
  timeZone?: string | null
  /** B9-34: Take back one addition of this ticked entry (hand additions only; anyone's) */
  onTakeBack?: (entry: ListEntry, addition: TickAddition) => void
  /** B9-43 (SSP-13): the Shop the estimate is at ("Estimated at Coop"); null/omitted for Any Shop ("Estimated") */
  shopName?: string | null
  /** B9-43 (SSP-13): "Change the Price" opens the Price sheet of the Line's Product; the sheet stays open under it */
  onChangePrice?: (entry: ListEntry) => void
}

const labels: Record<Exclude<LineAction, 'delete'>, string> = {
  'mark-it': shopStrings.markIt,
  'not-needed': shopStrings.notNeeded,
  'needed-after-all': shopStrings.neededAfterAll,
  'change-amount': shopStrings.changeAmount,
  'untick': '',
  'get-something-else': shopStrings.getSomethingElse,
}

const actionIcons: Partial<Record<LineAction, IconName>> = { 'change-amount': 'edit', untick: 'undo' }

export function LineSheet({ entry, actions, onAction, onClose, system = 'metric', timeZone, onTakeBack }: LineSheetProps) {
  if (!entry) return null
  const isLine = entry.kind === 'line' && !entry.ticked
  return (
    <BottomSheet open onClose={onClose} title={entry.title}>
      <div className="shop-line-sheet">
        {entry.ticked ? (
          <TickedDetails entry={entry} actions={actions} system={system} timeZone={timeZone ?? null} onTakeBack={onTakeBack} />
        ) : (
          <>
            {entry.quantityText ? <p className="shop-line-sheet__quantity">{entry.quantityText}</p> : null}
            {entry.packLine ? <p className="shop-line-sheet__pack">{entry.packLine}</p> : null}
            {isLine ? (
              <div className="shop-line-sheet__cost">
                <p className="shop-line-sheet__caption">{shopStrings.estimated}</p>
                <p className="shop-line-sheet__amount">{entry.estimatedCost ?? shopStrings.noPrice}</p>
              </div>
            ) : null}
          </>
        )}
        {entry.hint ? <p className="shop-line-sheet__hint">{entry.hint}</p> : null}
        {actions.length > 0 ? (
          <div className="shop-line-sheet__actions" data-ticked={entry.ticked ? 'true' : undefined}>
            {actions.map((action) =>
              action === 'delete' ? (
                <Button key={action} variant="danger" aria-label={shopStrings.deleteExtra(entry.title)} onClick={() => onAction(action)}>
                  {shopStrings.delete}
                </Button>
              ) : (
                <Button key={action} variant="secondary" icon={actionIcons[action]} data-action={action} onClick={() => onAction(action)}>
                  {action === 'untick' ? shopStrings.untick(entry.title) : labels[action]}
                </Button>
              ),
            )}
          </div>
        ) : null}
        {entry.ticked && hasHandAddition(entry) ? <p className="shop-line-sheet__note">{shopStrings.tickedNote}</p> : null}
      </div>
    </BottomSheet>
  )
}

const added = (a: TickAddition) => (a.quantity ?? 0) > 0
const hasHandAddition = (entry: ListEntry) => (entry.tick?.additions ?? []).some((a) => added(a) && a.by === 'hand')

interface TickedDetailsProps {
  entry: ListEntry
  actions: LineAction[]
  system: UnitSystem
  timeZone: string | null
  onTakeBack?: (entry: ListEntry, addition: TickAddition) => void
}

/** The state line, what the Line needed and the additions of a ticked entry. Focus after a Take back: the next one's, else Change amount. */
function TickedDetails({ entry, system, timeZone, onTakeBack }: TickedDetailsProps) {
  const unit = entry.baseUnit ?? 'piece'
  const q = (n: number) => formatQuantity(n, unit, system)
  const tick = entry.tick ?? null
  const rows = (tick?.additions ?? []).filter(added)
  const total = typeof tick?.added === 'number' ? tick.added : rows.reduce((n, a) => n + (a.quantity ?? 0), 0)
  const byScan = tick?.by === 'scan' && tick.additions.length <= 1
  const state = byScan ? shopStrings.tickedByScan : total > 0 ? shopStrings.tickedState(q(total)) : shopStrings.tickedNotAdded
  const tone = byScan ? 'neutral' : total > 0 ? 'success' : 'muted'
  const icon: IconName = byScan ? 'scan' : total > 0 ? 'success' : 'notAdded'

  // A11Y (SSP-18): a taken-back addition leaves the list when the list refreshes; focus goes to the Take back now at its place (the next
  // addition's), else the last one's, else Change amount, else Untick.
  const listRef = useRef<HTMLDivElement>(null)
  const refocus = useRef<number | null>(null)
  useEffect(() => {
    const at = refocus.current
    if (at === null) return
    const root = listRef.current?.closest('.shop-line-sheet')
    if (!root) return
    const backs = [...root.querySelectorAll<HTMLElement>('[data-take-back]')]
    const target =
      backs[Math.min(at, backs.length - 1)] ??
      root.querySelector<HTMLElement>('[data-action="change-amount"]') ??
      root.querySelector<HTMLElement>('[data-action="untick"]')
    refocus.current = null
    target?.focus()
    // `entry` is the refreshed list's copy: it changes when the Take back lands
  }, [entry])

  return (
    <div ref={listRef} className="ticked-sheet">
      <p className="ticked-sheet__state" data-tone={tone}>
        <Icon name={icon} size={20} />
        <span>{state}</span>
      </p>
      {entry.kind === 'line' && (entry.need ?? 0) > 0 ? <p className="ticked-sheet__need">{shopStrings.lineNeeded(q(entry.need ?? 0))}</p> : null}
      {rows.length > 0 ? (
        <ul className="ticked-sheet__adds" aria-label={shopStrings.additionsList}>
          {rows.map((a, i) => {
            const amount = q(a.quantity ?? 0)
            const who = a.by === 'scan' ? shopStrings.scannedBy(a.mine ? shopStrings.you : a.who) : a.mine ? shopStrings.you : a.who
            const detail = additionDetail(a, timeZone)
            return (
              <li key={`${a.clientUuid ?? ''}|${a.tickedAt}|${i}`} className="ticked-sheet__add">
                <span className="ticked-sheet__key">{who}</span>
                <span className="ticked-sheet__amount">{shopStrings.plusAmount(amount)}</span>
                {detail ? <span className="ticked-sheet__detail">{detail}</span> : null}
                {a.by === 'hand' && onTakeBack ? (
                  <span className="ticked-sheet__act">
                    <Button
                      variant="secondary"
                      size="sm"
                      data-take-back=""
                      aria-label={a.mine ? shopStrings.takeBackMine(amount) : shopStrings.takeBackOf(a.who, amount)}
                      onClick={() => {
                        refocus.current = i
                        onTakeBack(entry, a)
                      }}
                    >
                      {shopStrings.takeBack}
                    </Button>
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
