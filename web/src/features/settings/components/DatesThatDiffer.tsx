import type { DateRow } from '../lib/mealSlotCards'
import type { Member } from '../types'
import '../mealSlotCards.css'

export interface DatesThatDifferProps {
  rows: DateRow[]
  members: Member[]
}

/** STUB (test-first): the read-only "Dates that differ" tile. */
export function DatesThatDiffer(_props: DatesThatDifferProps) {
  return null
}
