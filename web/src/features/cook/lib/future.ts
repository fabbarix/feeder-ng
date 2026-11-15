// B9-40 stub (PC-12): a meal on a future date. The developer implements it.

/** The meal's date is after the household's today (both YYYY-MM-DD). An empty today is not future. */
export function isFutureMeal(_date: string, _today: string): boolean {
  return false
}

/** "Mon 16": the short weekday and the day of the month. */
export function dayLabel(_date: string): string {
  return ''
}

/** The held line on the last Step of a future meal; '' for a meal that may be marked. */
export function futureLine(_date: string, _today: string): string {
  return ''
}

/** The slot name with its day when the meal is in the future: "Mon 16 Dinner"; today's and past meals keep "Dinner". */
export function dayTitle(name: string, _date: string, _today: string): string {
  return name
}
