import type { MemberPreferences, PreferenceState, RecipeLine } from '../types'
import { isExcluded, stateOf } from './preference'

/** A Member as the preferences table and the Exclusion lists draw it (Avatar and name). */
export interface PreferenceMember {
  id: number
  name: string
  /** The linked User, or null. */
  userId: number | null
  colour?: string
  /** An emoji shown instead of the initials. */
  avatar?: string
  photoUrl?: string
}

/** One row of the Recipe's preferences table. */
export interface PreferenceRow {
  member: PreferenceMember
  /** True for the Member linked to the signed-in User (the row says "You"). */
  you: boolean
  /** The Member's own state for the Recipe ('none' while their preferences are not loaded). */
  state: PreferenceState
  /** Names of the Recipe's Ingredients (optional lines included) that the Member excludes: line order, no repeats. */
  via: string[]
}

/**
 * One row per Member for the Recipe. The Member linked to `meUserId` comes first, the rest in `members` order; see
 * docs/dev/design/rx-pt.md section 5.2.
 */
export function preferenceRows(
  members: PreferenceMember[],
  prefsByMember: Record<number, MemberPreferences | undefined>,
  recipeId: number,
  lines: RecipeLine[],
  meUserId: number | null,
): PreferenceRow[] {
  const linked = meUserId === null ? undefined : members.find((m) => m.userId === meUserId)
  const ordered = linked ? [linked, ...members.filter((m) => m !== linked)] : members
  return ordered.map((member) => {
    const prefs = prefsByMember[member.id]
    return {
      member,
      you: member === linked,
      state: prefs ? stateOf(prefs.recipes, recipeId) : 'none',
      via: prefs ? viaNames(prefs, lines) : [],
    }
  })
}

/** The Members who exclude the Ingredient, in `members` order. Members whose preferences are not loaded are skipped. */
export function excludersOf<M extends PreferenceMember>(members: M[], prefsByMember: Record<number, MemberPreferences | undefined>, ingredientId: number): M[] {
  return members.filter((m) => {
    const prefs = prefsByMember[m.id]
    return prefs !== undefined && isExcluded(prefs.excludedIngredients, ingredientId)
  })
}

/** Names of the Recipe's lines whose Ingredient the Member excludes: line order, each name once. */
function viaNames(prefs: MemberPreferences, lines: RecipeLine[]): string[] {
  const names: string[] = []
  for (const line of lines) {
    const name = line.ingredient ?? ''
    if (name === '' || names.includes(name)) continue
    if (isExcluded(prefs.excludedIngredients, line.ingredientId)) names.push(name)
  }
  return names
}
