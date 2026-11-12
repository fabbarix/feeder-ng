import type { MealSlotCard as Card } from '../lib/mealSlotCards'
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

/** STUB (test-first): one Bento Tile per Meal Slot name. */
export function MealSlotCard(_props: MealSlotCardProps) {
  return null
}
