import { Button, Chip, Icon, Tile, mealSlotIcon, weekdayLongName } from '../../../ui'
import { AttendanceStack } from './AttendanceStack'
import { MealSlotDifferences } from './MealSlotDifferences'
import { MealSlotWeekStrip } from './MealSlotWeekStrip'
import { courseEatersText, daysLabel, type MealSlotCard as Card } from '../lib/mealSlotCards'
import { documentLocale } from '../lib/locale'
import { settingsStrings } from '../strings'
import type { MealSlot, Member } from '../types'
import '../mealSlotCards.css'

export interface MealSlotCardProps {
  card: Card
  members: Member[]
  /** An Admin edits; a plain User sees the card read-only except "Change a date". */
  canEdit: boolean
  addDisabled?: boolean
  locale?: string
  /** Admin: "Edit <name>" (card.editSlot), a strip day or a "Differs on" row (that weekday's slot): opens the Meal Slot sheet. */
  onEdit: (slot: MealSlot) => void
  /** "Nobody attending": an Admin gets the sheet, a plain User the one-date Attendance (the page decides). */
  onFix: (slot: MealSlot) => void
  /** "Change a date for <name>": the one-date Attendance of the card's next run. */
  onChangeDate: (card: Card) => void
  /** Admin: a dashed "+" on a free day. */
  onAddOn: (weekday: number, name: string) => void
}

const text = settingsStrings.slot

/** One Bento tile per Meal Slot name: its usual time and Courses, Attendance only where it differs, the 7-day strip, "Differs on" and the footer. */
export function MealSlotCard({ card, members, canEdit, addDisabled = false, locale = documentLocale(), onEdit, onFix, onChangeDate, onAddOn }: MealSlotCardProps) {
  const editDay = weekdayLongName(card.editSlot.weekday, locale)
  const attendance = card.usualAttendance
  return (
    <Tile as="section" span={card.span === 'full' ? 'full' : 1} aria-label={card.name} className="ms-card">
      <div className="ms-card__top">
        <span className="ms-card__badge">
          <Icon name={mealSlotIcon(card.name)} size={24} />
        </span>
        <div className="ms-card__title">
          <h2 className="ms-card__name">{card.name}</h2>
          <p className="ms-card__days">{daysLabel(card.days, locale)}</p>
        </div>
        <div className="ms-card__time">
          <span className="ms-card__clock" data-testid="usual-time">
            {card.usualTime}
          </span>
          <span className="ms-card__usual">{text.usualTimeLabel}</span>
        </div>
      </div>
      <div className="ms-card__split">
        <div className="ms-card__main">
          {card.usualCourses.length > 0 ? (
            <div className="ms-fact">
              <span className="ms-fact__label">{text.usualCourses}</span>
              <ul className="ms-courses" aria-label={text.usualCourses}>
                {card.usualCourses.map((c) => (
                  <li key={c.id} className="ms-course" data-optional={c.optional || undefined}>
                    <Chip kind="tag">{c.optional ? `${c.name} (${text.optionalSuffix})` : c.name}</Chip>
                  </li>
                ))}
              </ul>
              {card.usualCourses.map((c) => {
                const eaters = courseEatersText(c, members)
                return eaters ? (
                  <p key={c.id} className="ms-courses__eaters">
                    {eaters}
                  </p>
                ) : null
              })}
            </div>
          ) : null}
          {attendance.state === 'some' ? (
            <div className="ms-fact">
              <span className="ms-fact__label">{text.attendanceLabel}</span>
              <AttendanceStack attendance={attendance} members={members} label={text.attendingCard(card.name)} />
            </div>
          ) : null}
          {attendance.state === 'nobody' ? (
            <div className="ms-fact">
              <span className="ms-fact__label">{text.attendanceLabel}</span>
              <button type="button" className="ms-nobody" aria-label={text.nobodyAttendingFix(card.name, editDay)} onClick={() => onFix(card.editSlot)}>
                <Icon name="error" size={14} />
                {text.nobodyAttending}
              </button>
            </div>
          ) : null}
          <MealSlotWeekStrip name={card.name} cells={card.week} canEdit={canEdit} addDisabled={addDisabled} locale={locale} onEdit={onEdit} onAddOn={onAddOn} />
        </div>
        <MealSlotDifferences card={card} members={members} canEdit={canEdit} locale={locale} onEdit={onEdit} />
      </div>
      <div className="ms-card__foot">
        {canEdit ? (
          <Button variant="secondary" size="sm" icon="edit" onClick={() => onEdit(card.editSlot)}>
            {text.cardEdit(card.name)}
          </Button>
        ) : null}
        <Button variant="tertiary" size="sm" icon="plan" aria-label={text.cardChangeDate(card.name)} onClick={() => onChangeDate(card)}>
          {text.changeDateButton}
        </Button>
      </div>
    </Tile>
  )
}
