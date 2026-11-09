// The range picker's choices (functional spec §9: from now to a date the User chooses, default today + 7, capped at
// the Planning Horizon). Plain TypeScript, no React. Stubs until implemented.

export interface RangeChoice {
  /** YYYY-MM-DD, the last day of the range */
  to: string
  /** "Today", "Tomorrow", "Thu 12" */
  label: string
}

/** One choice per day from today to maxTo inclusive (at most 14). A maxTo before today gives just today. */
export function rangeChoices(today: string, maxTo: string): RangeChoice[] {
  void today
  void maxTo
  throw new Error('not implemented')
}

/** "Today" / "Tomorrow" / "Thu 12" for a date relative to today (weekday names are English constants). */
export function dayLabel(date: string, today: string): string {
  void date
  void today
  throw new Error('not implemented')
}

/** The heading of the range: "Today" for to === today, else "Until tomorrow" / "Until Thu 12". */
export function describeRange(to: string, today: string): string {
  void to
  void today
  throw new Error('not implemented')
}
