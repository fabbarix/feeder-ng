import { Icon, weekdayLongName, weekdayShortName } from '../../../ui'
import { differenceParts, type MealSlotCard } from '../lib/mealSlotCards'
import { documentLocale } from '../lib/locale'
import { settingsStrings } from '../strings'
import type { MealSlot, Member } from '../types'
import '../mealSlotCards.css'

export interface MealSlotDifferencesProps {
  card: MealSlotCard
  members: Member[]
  canEdit: boolean
  locale?: string
  onEdit: (slot: MealSlot) => void
}

const text = settingsStrings.slot

/** The days of a card that differ from its usual: "Wed · Fabio only", "Fri · 20:00 · Main only". An Admin's row opens that day's Meal Slot. */
export function MealSlotDifferences({ card, members, canEdit, locale = documentLocale(), onEdit }: MealSlotDifferencesProps) {
  if (card.differences.length === 0) return null
  return (
    <div className="ms-diffs">
      <p className="ms-subhead">{text.differsOn}</p>
      <ul className="ms-diffs__list" aria-label={text.differsOn}>
        {card.differences.map((d) => {
          const what = differenceParts(d, card, members).join(' · ')
          const body = (
            <>
              <span className="ms-diff__day">{weekdayShortName(d.weekday, locale)}</span>
              {what ? (
                <>
                  {' · '}
                  <span className="ms-diff__what">{what}</span>
                </>
              ) : null}
            </>
          )
          return (
            <li key={d.weekday} className="ms-diff">
              {canEdit ? (
                <button type="button" className="ms-diff__button" aria-label={text.edit(card.name, weekdayLongName(d.weekday, locale))} onClick={() => onEdit(d.slot)}>
                  <span className="ms-diff__body">{body}</span>
                  <Icon name="chevron" size={16} />
                </button>
              ) : (
                <span className="ms-diff__body">{body}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
