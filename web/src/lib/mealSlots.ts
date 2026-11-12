// CRS E2: the Meal Slot label shared by plan and recipes (ISO weekday: 1 = Monday, 7 = Sunday).

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** "Friday Dinner" from weekday 5 (ISO, 1 = Monday) and the Meal Slot name. */
export function mealSlotLabel(weekday: number, name: string): string {
  return `${WEEKDAYS[(weekday - 1 + 7) % 7]} ${name}`
}
