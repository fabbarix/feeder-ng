// The Leftover sheets' view model: defaults, the request each confirm sends, the place choices and the notes (pure, no React).
import { freezeNote, leftoverStrings, replannedNote, takeOutNote, useByPhrase } from './copy'
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

// ---- B9-45 (PC-13): the Freeze sheet's words. ----

/** The sheet's title: "How many portions to freeze?". */
export const freezeQuestion = 'How many portions to freeze?'

/** A portion count as the sheet writes it: at most two decimals, never rounded to one ("0.25", never "0.3"). */
export const portionNumber = (n: number): string => String(Math.round(n * 100) / 100)

/** The context line under the title: "Cauliflower al gorgonzola · 1.25 left" (one line; the sheet ends it in an ellipsis). */
export function freezeContext(recipeName: string, left: number): string {
  return `${recipeName} · ${portionNumber(left)} left`
}

const meals = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/**
 * The muted hint under the stepper, about the default (every spare portion):
 * "All of it. None of it is planned." / "1.25 of 2.5. The rest is planned for Mon Dinner." / "All of it is planned for Mon Dinner." (nothing spare).
 * `plannedFor` names the Planned Meals ("Mon Dinner"); without names: "The rest is planned." / "All of it is planned."
 */
export function freezeHint(left: number, plannedPortions: number, plannedFor: string[]): string {
  const where = plannedFor.length > 0 ? ` for ${meals(plannedFor)}` : ''
  if (plannedPortions <= 0) return 'All of it. None of it is planned.'
  const spare = freezeDefaultPortions(left, plannedPortions)
  if (plannedPortions >= left || spare >= left) return `All of it is planned${where}.`
  return `${portionNumber(spare)} of ${portionNumber(left)}. The rest is planned${where}.`
}

/** The primary button: "Freeze 1.25 portions", "Freeze 1 portion". */
export function freezeLabel(portions: number): string {
  return portions === 1 ? 'Freeze 1 portion' : `Freeze ${portionNumber(portions)} portions`
}

/** Where a freeze goes: the chosen freezer's name and "Use by 10 Feb" (the Recipe's Frozen Use-by, else the Household's); null with no freezer chosen. */
export function freezeDestination(input: SheetInput, placeId: number | null): { placeName: string; useBy: string } | null {
  const place = input.places.find((p) => p.id === placeId)
  if (!place) return null
  const { date } = freezeUseBy(input.today, input.recipeFrozenUseBy, input.householdFrozenUseBy)
  return { placeName: place.name, useBy: useByPhrase(date, input.today) }
}
