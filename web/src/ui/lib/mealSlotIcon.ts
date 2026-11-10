import type { IconName } from '../icons'

const SLOT_ICONS = new Map<string, IconName>([
  ['breakfast', 'breakfast'],
  ['lunch', 'lunch'],
  ['dinner', 'dinner'],
  ['snack', 'snack'],
])

/** Icon for a Meal Slot name: whole-name, case-insensitive match, else `other`. */
export function mealSlotIcon(name: string): IconName {
  return SLOT_ICONS.get(name.trim().toLowerCase()) ?? 'other'
}
