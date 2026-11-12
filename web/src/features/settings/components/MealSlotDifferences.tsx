import type { MealSlotCard } from '../lib/mealSlotCards'
import type { MealSlot, Member } from '../types'
import '../mealSlotCards.css'

export interface MealSlotDifferencesProps {
  card: MealSlotCard
  members: Member[]
  canEdit: boolean
  locale?: string
  onEdit: (slot: MealSlot) => void
}

/** STUB (test-first): the "Differs on" list of a card. */
export function MealSlotDifferences(_props: MealSlotDifferencesProps) {
  return null
}
