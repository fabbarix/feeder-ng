// Beta.5 F7: the "Last cooked" copy of a Recipe (Recipe tile, row and detail). Plain TypeScript, no React.
// Stubs until implemented.

/** Today as YYYY-MM-DD in the browser's local time (the household's day on a device in the household's zone). */
export function localToday(_now: Date = new Date()): string {
  return ''
}

/**
 * Pure. The line a Recipe shows for its `lastCookedOn` (YYYY-MM-DD, null = never), relative to `today` (YYYY-MM-DD):
 * null -> 'Not cooked yet'; 0 days -> 'Last cooked today'; 1 -> 'Last cooked yesterday'; 2 to 6 -> 'Last cooked Tue'
 * (short English weekday); 7 or more (or a date after today) -> 'Last cooked 3 Oct' (day, short month).
 * With no `today` yet ('') a date reads as the day-and-month form.
 */
export function lastCookedLabel(_lastCookedOn: string | null, _today: string): string {
  return ''
}
