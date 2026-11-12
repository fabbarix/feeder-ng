import { Tile } from '../../../ui'
import { datePartText, type DateRow } from '../lib/mealSlotCards'
import { settingsStrings } from '../strings'
import type { Member } from '../types'
import '../mealSlotCards.css'

export interface DatesThatDifferProps {
  rows: DateRow[]
  members: Member[]
}

const text = settingsStrings.slot

/** The read-only "Dates that differ" tile: the upcoming one-date changes, soonest first. Changed from the Plan, not here. */
export function DatesThatDiffer({ rows, members }: DatesThatDifferProps) {
  return (
    <Tile as="section" span="full" aria-label={text.datesThatDiffer} overline={text.datesThatDiffer} overlineIcon="plan" className="ms-dates">
      {rows.length === 0 ? (
        <p className="ms-dates__none">{text.datesNone}</p>
      ) : (
        <ul className="ms-dates__list">
          {rows.map((r) => (
            <li key={r.key} className="ms-date">
              <span className="ms-date__day">{r.dateLabel}</span>
              <span className="ms-date__what">
                <span className="ms-date__slot">{r.slotName}</span>
                {r.parts.map((p, i) => (
                  <span key={i} className="ms-date__part" data-kind={p.kind}>
                    {datePartText(p, members)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="ms-dates__note">{text.datesNote}</p>
    </Tile>
  )
}
