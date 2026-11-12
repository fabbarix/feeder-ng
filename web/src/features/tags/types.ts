// Types of the Settings > Tags feature (TG-S).
import type { ImpactSlotRule, Tag, TagImpact } from '../../lib/tags'

/** What the Tag sheet is showing: nothing (null at the call sites), a new Tag, or one Tag being edited. */
export type SheetState = { mode: 'new' } | { mode: 'edit'; tag: Tag }

/** The Name and Tag colour as typed in the sheet (the name is not yet trimmed or collapsed). */
export interface TagFormValues {
  name: string
  colour: string
}

/** The answer of a Save: ok closes the sheet; a refusal keeps it, with `error` shown under Name when there is one. */
export type SaveResult = { ok: true } | { ok: false; error?: string }

/** The Merge into… dialog: the Tag that goes, and the Tag chosen to keep (null until chosen). */
export interface MergePickerState {
  source: Tag
  targetId: number | null
}

/** GET /api/tags/{id}/impact?into=<id>: the impact plus how many Recipes already carry both Tags (an integer, 0 included). */
export interface MergeImpact extends TagImpact {
  bothRecipes?: number
}

/**
 * A Slot Rule as the impact route really sends it (tg-api.md): the lib type plus the names and weekday that let the confirms
 * write "Friday Dinner · Main = fish". The extras are optional so a plain ImpactSlotRule still fits.
 */
export type RuleLike = ImpactSlotRule & {
  mealSlotName?: string
  /** ISO weekday of the Meal Slot, 1 = Monday .. 7 = Sunday. */
  weekday?: number
  courseName?: string | null
}
