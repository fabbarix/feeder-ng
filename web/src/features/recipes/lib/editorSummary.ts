import type { CourseChoice } from '../../../lib/courses'
import { recipeStrings } from '../strings'
import type { RecipeDraft } from './draft'

// B9-37 (RX-02, decision RX 5): the one-line summaries of the two closed Disclosure sections. Pure; the screen shows them.

const ABOUT_MAX = 60
const SEP = ' · '

/** The host of a link without "www.", or null when it is not a web address. */
function hostOf(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname
    return host === '' ? null : host.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** The description on one line, cut at 60 characters with "…" (never after a space). */
function shortText(text: string): string {
  const one = text.trim().replace(/\s+/g, ' ')
  if (one.length <= ABOUT_MAX) return one
  return `${one.slice(0, ABOUT_MAX).trimEnd()}…`
}

/** "Description and source" summary: the first 60 characters of the description and the Source host, or "Optional" when both are empty. */
export function aboutSummary(draft: Pick<RecipeDraft, 'description' | 'sourceUrl'>): string {
  const parts = [shortText(draft.description), hostOf(draft.sourceUrl) ?? ''].filter((p) => p !== '')
  return parts.length === 0 ? recipeStrings.fields.optionalSummary : parts.join(SEP)
}

/** The overrides set on the draft, by name and value ("Cool-down 5 days"). */
function overrides(draft: RecipeDraft): string[] {
  const s = recipeStrings.fields.summary
  const set = (text: string) => text.trim() !== ''
  return [
    set(draft.cooldownDays) ? s.cooldown(draft.cooldownDays.trim()) : null,
    set(draft.leftoverUseByDays) ? s.leftoverUseBy(draft.leftoverUseByDays.trim()) : null,
    set(draft.reheatMinutes) ? s.reheat(draft.reheatMinutes.trim()) : null,
    set(draft.frozenUseByDays) ? s.frozenUseBy(draft.frozenUseByDays.trim()) : null,
  ].filter((p): p is string => p !== null)
}

/** Up to three Tags, then "+N". */
function tagsPart(tags: readonly string[]): string {
  if (tags.length === 0) return ''
  const shown = tags.slice(0, 3).join(', ')
  return tags.length > 3 ? `${shown} +${tags.length - 3}` : shown
}

/** "Planning" summary: Courses (household order) · up to three Tags (+N) · one override by name or "N overrides"; "Never planned" for a Base recipe. */
export function planningSummary(draft: RecipeDraft, courses: readonly CourseChoice[]): string {
  const s = recipeStrings.fields.summary
  const tags = tagsPart(draft.tags)
  if (draft.baseRecipe === true) return [s.neverPlanned, tags].filter((p) => p !== '').join(SEP)
  const chosen = new Set(draft.courseIds)
  // The household's Courses come in household order.
  const courseNames = courses.filter((c) => chosen.has(c.id)).map((c) => c.name).join(', ')
  const set = overrides(draft)
  const overridePart = set.length === 0 ? '' : set.length === 1 ? set[0]! : s.overrides(set.length)
  const parts = [courseNames, tags, overridePart].filter((p) => p !== '')
  return parts.length === 0 ? s.householdDefaults : parts.join(SEP)
}
