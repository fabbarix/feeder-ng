import type { Why } from '../types'

/** Weekday names from a YYYY-MM-DD date, independent of the browser locale and time zone. */
export function weekdayName(date: string, style: 'short' | 'long' = 'long'): string {
  void [date, style]
  throw new Error('TODO: developer')
}

export interface PhraseContext {
  /** Date of the slot the chip belongs to ("Slot Rule: Friday" names its weekday). */
  slotDate: string
}

/** Phrases one why chip for people; '' for a code it does not know. */
export function phraseWhy(why: Why, ctx: PhraseContext): string {
  void [why, ctx]
  throw new Error('TODO: developer')
}

/** Phrases the chips in order, drops unknown ones and keeps at most three. */
export function phraseAll(chips: Why[], ctx: PhraseContext): string[] {
  void [chips, ctx]
  throw new Error('TODO: developer')
}
