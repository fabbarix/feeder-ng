import { planStrings as s } from '../strings'
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
      return why.date && why.ingredient ? s.whyIngredientOverlap(weekdayName(why.date), why.ingredient) : s.whyOpenStock
    case 'favourite': {
      const m = why.members ?? []
      if (m.length === 0) return s.whyFavouriteAnyone
      if (m.length === 1) return s.whyFavouriteOne(m[0]!)
      if (m.length === 2) return s.whyFavouriteTwo(m[0]!, m[1]!)
      return s.whyFavouriteMany(m.length)
    }
    case 'perishable_use':
      return why.date
        ? s.whyGoesOff(why.ingredient ?? s.whyUnnamedIngredient, weekdayName(why.date, 'short'))
        : s.whyUsesUp(why.ingredient ?? s.whyUnnamedIngredientShort)
    case 'slot_rule':
      return s.whySlotRule(weekdayName(ctx.slotDate))
    case 'leftover':
      return why.date ? s.whyLeftoverFrom(weekdayName(why.date, 'short')) : s.whyLeftover
    case 'stock_coverage':
      return s.whyInStock
    case 'leftover_fits':
      return why.date ? s.whyLeftoversFor(weekdayName(why.date, 'short')) : s.whyLeftoversToCome
    case 'best_available':
      return s.whyBestAvailable
    default:
      return ''
  }
}

/** Phrases the chips in order, drops unknown ones and keeps at most three. */
export function phraseAll(chips: Why[], ctx: PhraseContext): string[] {
  return chips.map((c) => phraseWhy(c, ctx)).filter((s) => s !== '').slice(0, 3)
}
