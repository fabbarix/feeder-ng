// Which cached queries a "household" event makes stale. Query keys mirror hooks/queryKeys.ts.
export type HouseholdChange = 'settings' | 'members' | 'mealSlots' | 'attendance' | 'courses' | 'slotDates'

const KEYS: Record<HouseholdChange, ReadonlyArray<readonly string[]>> = {
  settings: [['household', 'settings']],
  members: [['household', 'members'], ['household', 'meal-slots']],
  mealSlots: [['household', 'meal-slots']],
  attendance: [['household', 'attendance'], ['household', 'meal-slots']],
  courses: [['courses'], ['household', 'meal-slots']],
  // B5-F1: a date's own time, Not served or Guests changed on Plan or Today (the plan and "Dates that differ" read them).
  slotDates: [['plan', 'dates-that-differ'], ['household', 'meal-slots']],
}

/** The query-key prefixes to refetch for an event payload like {"changed":"members"}; none for anything unknown. */
export function staleKeysFor(data: unknown): ReadonlyArray<readonly string[]> {
  if (typeof data !== 'object' || data === null) return []
  const changed = (data as { changed?: unknown }).changed
  return typeof changed === 'string' && Object.hasOwn(KEYS, changed) ? KEYS[changed as HouseholdChange] : []
}
