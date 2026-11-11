import type { MemberPreferences, PreferenceState, RecipeLine } from '../types'

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
 * STUB (PT, step 1): one row per Member for the Recipe. The Member linked to `meUserId` comes first, the rest in `members`
 * order; see docs/dev/design/rx-pt.md section 5.2.
 */
export function preferenceRows(
  members: PreferenceMember[],
  prefsByMember: Record<number, MemberPreferences | undefined>,
  recipeId: number,
  lines: RecipeLine[],
  meUserId: number | null,
): PreferenceRow[] {
  void members
  void prefsByMember
  void recipeId
  void lines
  void meUserId
  return []
}

/** STUB (PT, step 1): the Members who exclude the Ingredient, in `members` order. */
export function excludersOf(
  members: PreferenceMember[],
  prefsByMember: Record<number, MemberPreferences | undefined>,
  ingredientId: number,
): PreferenceMember[] {
  void members
  void prefsByMember
  void ingredientId
  return []
}
