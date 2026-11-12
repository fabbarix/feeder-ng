import type { WeekCell } from '../lib/mealSlotCards'
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

/** STUB (test-first): the 7-day strip of a card. */
export function MealSlotWeekStrip(_props: MealSlotWeekStripProps) {
  return null
}
