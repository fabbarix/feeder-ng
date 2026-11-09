import type { Why } from '../types'

const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Day number since the epoch of a YYYY-MM-DD date (UTC arithmetic, no browser time zone). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000)
}

/** Weekday names from a YYYY-MM-DD date, independent of the browser locale and time zone. */
export function weekdayName(date: string, style: 'short' | 'long' = 'long'): string {
  const name = LONG[new Date(dayNumber(date) * 86_400_000).getUTCDay()]!
  return style === 'short' ? name.slice(0, 3) : name
}

export interface PhraseContext {
  /** Date of the slot the chip belongs to ("Slot Rule: Friday" names its weekday). */
  slotDate: string
}

/** Phrases one why chip for people; '' for a code it does not know. */
export function phraseWhy(why: Why, ctx: PhraseContext): string {
  switch (why.code) {
    case 'ingredient_overlap':
      return why.date && why.ingredient ? `uses ${weekdayName(why.date)}'s ${why.ingredient}` : 'uses up what is open'
    case 'favourite': {
      const m = why.members ?? []
      if (m.length === 0) return 'a favourite'
      if (m.length === 1) return `${m[0]}'s favourite`
      if (m.length === 2) return `${m[0]} and ${m[1]}'s favourite`
      return `a favourite of ${m.length}`
    }
    case 'perishable_use':
      return why.date ? `${why.ingredient ?? 'an ingredient'} goes off ${weekdayName(why.date, 'short')}` : `uses up the ${why.ingredient ?? 'ingredient'}`
    case 'slot_rule':
      return `Slot Rule: ${weekdayName(ctx.slotDate)}`
    case 'leftover':
      return why.date ? `leftover from ${weekdayName(why.date, 'short')}` : 'leftover'
    case 'stock_coverage':
      return 'already in Stock'
    case 'leftover_fits':
      return why.date ? `leftovers for ${weekdayName(why.date, 'short')}` : 'leftovers to come'
    case 'best_available':
      return 'best available'
    default:
      return ''
  }
}

/** Phrases the chips in order, drops unknown ones and keeps at most three. */
export function phraseAll(chips: Why[], ctx: PhraseContext): string[] {
  return chips.map((c) => phraseWhy(c, ctx)).filter((s) => s !== '').slice(0, 3)
}
