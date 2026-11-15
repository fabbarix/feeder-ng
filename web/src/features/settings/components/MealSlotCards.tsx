import { BentoGrid, EmptyState } from '../../../ui'
import { DatesThatDiffer } from './DatesThatDiffer'
import { MealSlotCard } from './MealSlotCard'
import type { DateRow, MealSlotCard as Card } from '../lib/mealSlotCards'
import { settingsStrings } from '../strings'
import type { MealSlot, Member } from '../types'
import '../mealSlotCards.css'

export interface MealSlotCardsProps {
  cards: Card[]
  dateRows: DateRow[]
  members: Member[]
  canEdit: boolean
  addDisabled?: boolean
  locale?: string
  onEdit: (slot: MealSlot) => void
  /** SET-14h: "Edit <name>" on a card hands over the whole card (the sheet starts with every day of the name). */
  onEditCard?: (card: Card) => void
  onFix: (slot: MealSlot) => void
  onChangeDate: (card: Card) => void
  onAddOn: (weekday: number, name: string) => void
}

const text = settingsStrings.slot

/** The Meal Slots overview: the Household line once, one card per name on a "wide" Bento grid (two-up from two 28 rem tracks, SET-08), then "Dates that differ". */
export function MealSlotCards({ cards, dateRows, members, canEdit, addDisabled, locale, onEdit, onEditCard, onFix, onChangeDate, onAddOn }: MealSlotCardsProps) {
  if (cards.length === 0) return <EmptyState title={text.empty} description={text.emptyHint} />
  return (
    <div className="ms-cards">
      <p className="ms-household">{text.householdLine}</p>
      <BentoGrid min="wide">
        {cards.map((card) => (
          <MealSlotCard
            key={card.key}
            card={card}
            members={members}
            canEdit={canEdit}
            addDisabled={addDisabled}
            locale={locale}
            onEdit={onEdit}
            onEditCard={onEditCard}
            onFix={onFix}
            onChangeDate={onChangeDate}
            onAddOn={onAddOn}
          />
        ))}
        {dateRows.length > 0 ? <DatesThatDiffer rows={dateRows} members={members} /> : null}
      </BentoGrid>
    </div>
  )
}
