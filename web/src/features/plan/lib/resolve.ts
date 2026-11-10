// Which Planned Meals may be marked Cooked or Not cooked (R4 B10). Plain TypeScript, no React.

const DATE = /^\d{4}-\d{2}-\d{2}$/

function isDate(value: string): boolean {
  return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

/**
 * True when the meal's slot date is today or earlier (household date, YYYY-MM-DD both). Mirrors the server rule
 * plan.MayResolve: the date counts, not the time of day. Anything that is not a date is false.
 */
export function mayResolve(date: string, today: string): boolean {
  if (!isDate(date) || !isDate(today)) return false
  return date <= today
}

/** Cook Mode is offered for a Planned Meal dated today only (household dates, YYYY-MM-DD). */
export function mayCook(_date: string, _today: string): boolean {
  throw new Error('not implemented (WP6)')
}
