// Leftover copy in GLOSSARY words (docs/dev/design/b5-low.md section 3). Pure functions.
import { dateWord, weekdayShort } from './dates'
import type { LeftoverAnswer, LeftoverClaim } from './types'

export const leftoverStrings = {
  hadIt: 'Had it',
  threwOut: 'Threw it out',
  wasntThere: "Wasn't there",
  freezeIt: 'Freeze it',
  takeOut: 'Take out',
  cancel: 'Cancel',
  portions: 'Portions',
  storagePlace: 'Storage Place',
  wasteNote: 'This counts as waste: the zero-waste streak starts again today.',
  addFreezerFirst: 'Add a Freezer first',
  storagePlaces: 'Storage Places',
  fromTheFreezer: 'From the freezer',
  fromTheFreezerHint: 'From the freezer: take it out the day before',
  notSorted: 'Not sorted',
}

/** "1 portion", "2 portions", "1.5 portions", "0.5 portions". */
export function portionsLabel(n: number): string {
  return n === 1 ? '1 portion' : `${n} portions`
}

export const hadItTitle = (name: string): string => `How many portions of ${name} did you have?`
export const throwOutTitle = (name: string): string => `Throw out ${name}?`
export const freezeTitle = (name: string): string => `Freeze ${name}`
export const takeOutTitle = (name: string): string => `Take ${name} out of the freezer?`

/** "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?" */
export const questionText = (name: string, useBy: string, today: string): string =>
  `${name} was to be used by ${dateWord(useBy, today)}. Had it, threw it out, or wasn't there?`

/** "Use by Thu", "Use by today", "Use by 9 Feb". */
export const useByPhrase = (useBy: string, today: string): string => `Use by ${dateWord(useBy, today)}`

/** "Use by 9 Feb in the freezer (90 days)". */
export const freezeNote = (useBy: string, days: number, today: string): string =>
  `Use by ${dateWord(useBy, today)} in the freezer (${days} days)`

/** "Use by Sat once out (3 days)". */
export const takeOutNote = (useBy: string, days: number, today: string): string =>
  `Use by ${dateWord(useBy, today)} once out (${days} days)`

/** "Thu Lunch was going to have 2 portions of it; it is planned again." */
export const claimNote = (claim: LeftoverClaim): string =>
  `${weekdayShort(claim.date)} ${claim.slotName} was going to have ${portionsLabel(claim.portions)} of it; it is planned again.`

export const hadItToast = (name: string, had: number, left: number): string =>
  `Noted: ${portionsLabel(had)} of ${name}. ${left > 0 ? `${left} left.` : 'None left.'}`
export const threwOutToast = (name: string, threw: number): string => `Threw out ${portionsLabel(threw)} of ${name}.`
export const freezeToast = (name: string, placeName: string, useBy: string, today: string): string =>
  `${name} is in ${placeName}. ${useByPhrase(useBy, today)}.`
export const takeOutToast = (name: string, useBy: string, today: string): string =>
  `${name} is out of the freezer. ${useByPhrase(useBy, today)}.`
export const answerToast = (name: string, answer: LeftoverAnswer): string => {
  if (answer === 'had_it') return `Noted: ${name} was had.`
  if (answer === 'threw_out') return `Threw out ${name}.`
  return `${name} removed: it wasn't there.`
}

/** "From Mon's Chilli": the link on a Planned Meal served from a Leftover. */
export const fromLeftoverLabel = (fromDate: string, recipeName: string): string => `From ${weekdayShort(fromDate)}'s ${recipeName}`

const ERRORS: Record<string, (name: string) => string> = {
  leftover_past_use_by: (n) => `${n} is past its Use-by, so it cannot be frozen.`,
  leftover_frozen: (n) => `${n} is already frozen.`,
  leftover_not_frozen: (n) => `${n} is not frozen.`,
  leftover_not_to_answer: (n) => `${n} was already answered.`,
  portions_invalid: (n) => `There are not that many portions of ${n} left.`,
  storage_place_not_freezer: () => 'Pick a Storage Place of kind freezer.',
  storage_place_freezer: () => 'Pick a Storage Place that is not a freezer.',
}

/** The message for a failed action, by the API's error code. */
export function actionError(err: { status?: number; code?: string }, name: string): string {
  if (err.status === 404) return `${name} is gone.`
  const message = err.code ? ERRORS[err.code] : undefined
  return message ? message(name) : `Couldn't save that for ${name}. Try again.`
}
