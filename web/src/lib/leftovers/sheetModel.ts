// The Leftover sheets' view model: defaults, the request each confirm sends, the place choices and the notes (pure, no React).
import { freezeNote, leftoverStrings, replannedNote, takeOutNote } from './copy'
import { defaultFreezer, freezeDefaultPortions, freezerPlaces, freezeUseBy, hadItDefault, takeOutPlaces, takeOutUseBy, throwOutDefault } from './portions'
import { NOT_SORTED_PLACE, type Leftover, type LeftoverActionKind, type LeftoverPlace, type LeftoverRequest, type PlannedMealRef } from './types'

export interface SheetInput {
  action: LeftoverActionKind
  leftover: Leftover
  places: LeftoverPlace[]
  today: string
  /** The Recipe's Frozen Use-by, else null (the Household's applies). */
  recipeFrozenUseBy: number | null
  householdFrozenUseBy: number
  /** The Recipe's Use-by days (Take out). */
  recipeUseByDays: number
}

/** The draft a sheet holds: the portions and the chosen Storage Place (`NOT_SORTED_PLACE` for Not sorted, null for none). */
export interface SheetDraft {
  portions: number
  placeId: number | null
}

export interface PlaceChoice {
  value: number
  label: string
}

/** Where the sheet starts: the portions and place its action defaults to. */
export function sheetDefaults(input: SheetInput): SheetDraft {
  const { action, leftover, places } = input
  switch (action) {
    case 'had-it':
      return { portions: hadItDefault(leftover.portions), placeId: null }
    case 'threw-out':
      return { portions: throwOutDefault(leftover.portions), placeId: null }
    case 'freeze':
      return { portions: freezeDefaultPortions(leftover.portions, leftover.plannedPortions), placeId: defaultFreezer(places)?.id ?? null }
    case 'take-out': {
      const home = places.find((p) => p.default)
      const placeId = home && home.kind !== 'freezer' ? home.id : NOT_SORTED_PLACE
      return { portions: leftover.portions, placeId }
    }
  }
}

/** What the sheet's confirm sends, or null when there is nothing to confirm (Freeze it with no Freezer). */
export function sheetRequest(action: LeftoverActionKind, draft: SheetDraft): LeftoverRequest | null {
  switch (action) {
    case 'had-it':
      return { kind: 'had-it', portions: draft.portions }
    case 'threw-out':
      return { kind: 'threw-out', portions: draft.portions }
    case 'freeze':
      return draft.placeId === null ? null : { kind: 'freeze', storagePlaceId: draft.placeId, portions: draft.portions }
    case 'take-out':
      return { kind: 'take-out', storagePlaceId: draft.placeId === NOT_SORTED_PLACE ? null : draft.placeId }
  }
}

/** The Storage Place choices: freezers by name for Freeze it; the other places by name, then Not sorted, for Take out. */
export function placeChoices(action: LeftoverActionKind, places: LeftoverPlace[]): PlaceChoice[] {
  const option = (p: LeftoverPlace): PlaceChoice => ({ value: p.id, label: p.name })
  if (action === 'freeze') return freezerPlaces(places).map(option)
  if (action === 'take-out') return [...takeOutPlaces(places).map(option), { value: NOT_SORTED_PLACE, label: leftoverStrings.notSorted }]
  return []
}

/** The static notes of a sheet: the waste line, the Use-by of a freeze (only with a Freezer) or of a take out. */
export function sheetNotes(input: SheetInput): string[] {
  const { action, places, today, recipeFrozenUseBy, householdFrozenUseBy, recipeUseByDays } = input
  switch (action) {
    case 'had-it':
      return []
    case 'threw-out':
      return [leftoverStrings.wasteNote]
    case 'freeze': {
      if (freezerPlaces(places).length === 0) return []
      const { date, days } = freezeUseBy(today, recipeFrozenUseBy, householdFrozenUseBy)
      return [freezeNote(date, days, today)]
    }
    case 'take-out': {
      const { date, days } = takeOutUseBy(today, recipeUseByDays)
      return [takeOutNote(date, days, today)]
    }
  }
}

export interface ReplannedNote {
  /** Unique per Planned Meal: its date, slot and Course. */
  key: string
  text: string
}

/** One note per Planned Meal the server says would be replanned, in the order given. */
export function replannedNotes(refs: PlannedMealRef[]): ReplannedNote[] {
  return refs.map((ref) => ({
    key: `${ref.date}|${ref.mealSlotId}|${ref.courseId ?? '-'}`,
    text: replannedNote(ref),
  }))
}
