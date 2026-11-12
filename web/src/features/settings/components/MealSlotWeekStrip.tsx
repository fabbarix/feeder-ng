import { Icon, weekdayLongName, weekdayShortName } from '../../../ui'
import { documentLocale } from '../lib/locale'
import { slotAnchorId } from '../lib/slotAnchor'
import type { WeekCell } from '../lib/mealSlotCards'
import { settingsStrings } from '../strings'
import type { MealSlot } from '../types'
import '../mealSlotCards.css'

export interface MealSlotWeekStripProps {
  name: string
  cells: WeekCell[]
  canEdit: boolean
  addDisabled?: boolean
  locale?: string
  onEdit: (slot: MealSlot) => void
  onAddOn: (weekday: number, name: string) => void
}

const text = settingsStrings.slot

/** The seven days of a card, Monday first: a day the name runs shows its time (an Admin taps it to edit), a free day is a dashed "+" (an Admin adds). */
export function MealSlotWeekStrip({ name, cells, canEdit, addDisabled = false, locale = documentLocale(), onEdit, onAddOn }: MealSlotWeekStripProps) {
  return (
    <div className="ms-strip" role="group" aria-label={text.weekStripLabel(name)}>
      {cells.map((cell) => {
        const short = weekdayShortName(cell.weekday, locale)
        const long = weekdayLongName(cell.weekday, locale)
        if (cell.state === 'free') {
          if (!canEdit) {
            return (
              <div key={cell.weekday} className="ms-day" data-state="free">
                <span className="ms-day__name">{short}</span>
              </div>
            )
          }
          return (
            <button key={cell.weekday} type="button" className="ms-day" data-state="free" aria-label={text.addOnDay(name, long)} disabled={addDisabled} onClick={() => onAddOn(cell.weekday, name)}>
              <span className="ms-day__name">{short}</span>
              <Icon name="add" size={14} />
            </button>
          )
        }
        const diffId = `${slotAnchorId(cell.slot.id)}-diff`
        const body = (
          <>
            <span className="ms-day__name">{short}</span>
            <span className="ms-day__time">{cell.time}</span>
            {cell.differs ? (
              <span className="visually-hidden" id={diffId}>
                {text.differsFromUsual}
              </span>
            ) : null}
          </>
        )
        if (!canEdit) {
          return (
            <div key={cell.weekday} id={slotAnchorId(cell.slot.id)} tabIndex={-1} className="ms-day" data-state="runs" data-differs={cell.differs || undefined}>
              {body}
            </div>
          )
        }
        return (
          <button
            key={cell.weekday}
            type="button"
            id={slotAnchorId(cell.slot.id)}
            className="ms-day"
            data-state="runs"
            data-differs={cell.differs || undefined}
            aria-label={text.cellLabel(name, long)}
            aria-describedby={cell.differs ? diffId : undefined}
            onClick={() => onEdit(cell.slot)}
          >
            {body}
          </button>
        )
      })}
    </div>
  )
}
