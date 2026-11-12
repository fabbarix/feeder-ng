import type { DateRow, MealSlotCard as Card } from '../lib/mealSlotCards'
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
  onFix: (slot: MealSlot) => void
  onChangeDate: (card: Card) => void
  onAddOn: (weekday: number, name: string) => void
}

/** STUB (test-first): the household line, one MealSlotCard per name in a BentoGrid, then "Dates that differ"; an EmptyState without cards. */
export function MealSlotCards(_props: MealSlotCardsProps) {
  return null
}
