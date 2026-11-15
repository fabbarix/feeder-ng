import { Fragment } from 'react'
import { DetailList, DetailRow, Tile } from '../../../ui'
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
  if (rows.length === 0) return null
  return (
    <Tile as="section" span="full" aria-label={text.datesThatDiffer} overline={text.datesThatDiffer} overlineIcon="plan" className="ms-dates">
      <DetailList>
        {rows.map((r) => {
          // R-E: the key is the date and the Meal Slot; Not served is the row's state; the other differences are the muted detail.
          const notServed = r.parts.find((p) => p.kind === 'notServed')
          const rest = r.parts.filter((p) => p.kind !== 'notServed')
          return (
            <DetailRow
              key={r.key}
              label={`${r.dateLabel} · ${r.slotName}`}
              state={notServed ? datePartText(notServed, members) : undefined}
              detail={
                rest.length > 0
                  ? rest.map((p, i) => (
                      <Fragment key={i}>
                        {i > 0 ? ', ' : null}
                        <span data-kind={p.kind}>
                          {datePartText(p, members)}
                        </span>
                      </Fragment>
                    ))
                  : undefined
              }
            />
          )
        })}
      </DetailList>
      <p className="ms-dates__note">{text.datesNote}</p>
    </Tile>
  )
}
