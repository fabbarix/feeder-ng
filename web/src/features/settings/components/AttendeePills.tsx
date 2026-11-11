import { Icon, MemberPill, weekdayLongName } from '../../../ui'
import { attendeePills } from '../lib/attendeePills'
import { documentLocale } from '../lib/locale'
import { settingsStrings } from '../strings'
import type { MealSlot, Member } from '../types'
import '../settings.css'

export interface AttendeePillsProps {
  slot: MealSlot
  members: Member[]
  /** Pills before "+N" (default 4). */
  max?: number
  /** The "Nobody attending" pill is a button; it calls this (Admin: the slot sheet; a plain User: the one-date Attendance). */
  onFix?: (slot: MealSlot) => void
  locale?: string
}

const text = settingsStrings.slot

/** Member pills, "+N", or the "Nobody attending" warning pill. */
export function AttendeePills({ slot, members, max = 4, onFix, locale = documentLocale() }: AttendeePillsProps) {
  const model = attendeePills(slot.attendance, members, max)
  const weekday = weekdayLongName(slot.weekday, locale)
  if (model.state === 'nobody') {
    const content = (
      <>
        <Icon name="error" size={14} />
        {text.nobodyAttending}
      </>
    )
    return onFix ? (
      <button type="button" className="nobody-pill" data-tone="warn" aria-label={text.nobodyAttendingFix(slot.name, weekday)} onClick={() => onFix(slot)}>
        {content}
      </button>
    ) : (
      <span className="nobody-pill" data-tone="warn">
        {content}
      </span>
    )
  }
  return (
    <div className="attendee-pills" role="list" aria-label={text.attendingList(slot.name, weekday)}>
      {model.shown.map((m) => (
        <span key={m.id} role="listitem" className="attendee-pills__item">
          <MemberPill name={m.name} colour={m.colour} glyph={m.avatar || undefined} photoUrl={m.photoUrl || undefined} />
        </span>
      ))}
      {model.more.length > 0 ? (
        <span role="listitem" className="attendee-pills__more" aria-label={text.moreAttending(model.more.length, model.more.map((m) => m.name).join(', '))}>
          {`+${model.more.length}`}
        </span>
      ) : null}
    </div>
  )
}
