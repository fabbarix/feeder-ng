// B9-53 (TB-06, step 3): the Meal Slot quick start's rows and what Create sends. Plain functions, no React.
import { settingsStrings } from '../strings'

const text = settingsStrings.slot.quickStart

/** A row of "When do you eat?": a Meal Slot name and time, ticked or not. `custom` rows were added with "Add another Meal Slot". */
export interface QuickStartRow {
  key: string
  name: string
  /** "HH:MM" */
  time: string
  on: boolean
  custom: boolean
}

/** What Create sends: one entry per Meal Slot name, every weekday (the server makes everyone attend). */
export interface QuickStartSlot {
  name: string
  time: string
  weekdays: number[]
}

export const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]

/** The time a new row starts at: between Lunch and Dinner, where a Snack usually is. */
const NEW_ROW_TIME = '16:30'

/** Breakfast 07:30, Lunch 13:00 and Dinner 19:30; Lunch and Dinner ticked. */
export function quickStartRows(): QuickStartRow[] {
  return [
    { key: 'breakfast', name: text.breakfast, time: '07:30', on: false, custom: false },
    { key: 'lunch', name: text.lunch, time: '13:00', on: true, custom: false },
    { key: 'dinner', name: text.dinner, time: '19:30', on: true, custom: false },
  ]
}

/** A ticked row with no name yet, at the end. */
export function withNewRow(rows: QuickStartRow[]): QuickStartRow[] {
  const n = rows.filter((r) => r.custom).length + 1
  return [...rows, { key: `custom-${n}`, name: '', time: NEW_ROW_TIME, on: true, custom: true }]
}

/** The ticked rows that have a name, in time order, every weekday. An unnamed added row is not counted. */
export function quickStartSlots(rows: QuickStartRow[]): QuickStartSlot[] {
  return rows
    .filter((r) => r.on && r.name.trim() !== '')
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((r) => ({ name: r.name.trim(), time: r.time, weekdays: [...EVERY_DAY] }))
}

/** The name a row is called by in its controls: its own, or "New Meal Slot" (numbered from the second added row). */
export function rowLabel(rows: QuickStartRow[], row: QuickStartRow): string {
  if (row.name.trim() !== '') return row.name.trim()
  return text.newName(rows.filter((r) => r.custom).indexOf(row) + 1)
}

/** The label of an added row's Name field. */
export function rowNameField(rows: QuickStartRow[], row: QuickStartRow): string {
  return text.newNameField(rows.filter((r) => r.custom).indexOf(row) + 1)
}
