// Which Planned Meals may be marked Cooked or Not cooked (R4 B10). Plain TypeScript, no React.

/**
 * True when the meal's slot date is today or earlier (household date, YYYY-MM-DD both). Mirrors the server rule
 * plan.MayResolve: the date counts, not the time of day. STUB (red tests): the Developer implements it.
 */
export function mayResolve(date: string, today: string): boolean {
  void date
  void today
  return true
}
