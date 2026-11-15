// B9-32 (A11Y-08): the accessible names of the repeated row actions. STUBS: the test author's, to be replaced by the developer.
// Plain TypeScript, no React.

export type ActionKind = 'swap' | 'pin' | 'choose' | 'cook' | 'more'

export interface ActionContext {
  /** The Recipe of the row (swap, pin). */
  recipe?: string
  /** The Course of an empty row (choose). */
  course?: string
  /** The Plan's day label without "Today": "Sun 15" (see `dayLabel`). */
  day: string
  /** The Meal Slot's name: "Breakfast". */
  slot: string
}

/** "Sun 15": the short weekday and the day of the month of a date (never "Today"). */
export function dayLabel(_date: string): string {
  throw new Error('B9-32: dayLabel is not built yet')
}

/** The accessible name of a row action: "Swap Pasta al pomodoro, Sun 15 Breakfast". */
export function actionName(_kind: ActionKind, _ctx: ActionContext): string {
  throw new Error('B9-32: actionName is not built yet')
}
