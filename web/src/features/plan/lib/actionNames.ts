// B9-32 (A11Y-08): the accessible names of the repeated row actions. Plain TypeScript, no React.
import { planStrings as s } from '../strings'
import { weekdayName } from './phrase'

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
export function dayLabel(date: string): string {
  return `${weekdayName(date, 'short')} ${Number(date.split('-')[2])}`
}

/** The accessible name of a row action: "Swap Pasta al pomodoro, Sun 15 Breakfast". */
export function actionName(kind: ActionKind, ctx: ActionContext): string {
  const when = `${ctx.day} ${ctx.slot}`
  switch (kind) {
    case 'swap':
      return s.actionSwap(ctx.recipe ?? '', when)
    case 'pin':
      return s.actionPin(ctx.recipe ?? '', when)
    case 'choose':
      return s.actionChoose(ctx.course ?? '', when)
    case 'cook':
      return s.actionCook(when)
    case 'more':
      return s.actionMore(when)
  }
}
