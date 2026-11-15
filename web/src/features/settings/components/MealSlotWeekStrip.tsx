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

/**
 * The seven days of a card, in week order. SET-08: a day the name runs shows its weekday, and its time only when that differs from
 * the card's usual time (the dot marks any difference); its accessible name always says the time. An Admin taps a day to edit it.
 * A free day is a dashed "+" (an Admin adds).
 */
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
            {cell.timeDiffers ? <span className="ms-day__time">{cell.time}</span> : null}
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
              {/* The time a usual day does not print, for assistive technology (a button says it in its name). */}
              {cell.timeDiffers ? null : <span className="visually-hidden">{cell.time}</span>}
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
            aria-label={`${text.cellLabel(name, long)}, ${cell.time}`}
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
