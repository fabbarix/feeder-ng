// Leftover copy in GLOSSARY words (docs/dev/design/b5-low.md section 3). Pure functions. STUB (red).
import type { LeftoverAnswer, LeftoverClaim } from './types'

export const leftoverStrings = {
  hadIt: 'Had it',
  threwOut: 'Threw it out',
  wasntThere: "Wasn't there",
  freezeIt: 'Freeze it',
  takeOut: 'Take out',
  cancel: 'Cancel',
  wasteNote: 'This counts as waste: the zero-waste streak starts again today.',
  addFreezerFirst: 'Add a Freezer first',
  storagePlaces: 'Storage Places',
  fromTheFreezer: 'From the freezer',
  fromTheFreezerHint: 'From the freezer: take it out the day before',
  notSorted: 'Not sorted',
}

/** "1 portion", "2 portions", "1.5 portions", "0.5 portions". */
export function portionsLabel(_n: number): string {
  return ''
}

export const hadItTitle = (_name: string): string => ''
export const throwOutTitle = (_name: string): string => ''
export const freezeTitle = (_name: string): string => ''
export const takeOutTitle = (_name: string): string => ''

/** "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?" */
export const questionText = (_name: string, _useBy: string, _today: string): string => ''

/** "Use by Thu", "Use by today", "Use by 9 Feb". */
export const useByPhrase = (_useBy: string, _today: string): string => ''

/** "Use by 9 Feb in the freezer (90 days)". */
export const freezeNote = (_useBy: string, _days: number, _today: string): string => ''

/** "Use by Sat once out (3 days)". */
export const takeOutNote = (_useBy: string, _days: number, _today: string): string => ''

/** "Thu Lunch was going to have 2 portions of it; it is planned again." */
export const claimNote = (_claim: LeftoverClaim): string => ''

export const hadItToast = (_name: string, _had: number, _left: number): string => ''
export const threwOutToast = (_name: string, _threw: number): string => ''
export const freezeToast = (_name: string, _placeName: string, _useBy: string, _today: string): string => ''
export const takeOutToast = (_name: string, _useBy: string, _today: string): string => ''
export const answerToast = (_name: string, _answer: LeftoverAnswer): string => ''

/** "From Mon's Chilli": the link on a Planned Meal served from a Leftover. */
export const fromLeftoverLabel = (_fromDate: string, _recipeName: string): string => ''

/** The message for a failed action, by the API's error code. */
export function actionError(_err: { status?: number; code?: string }, _name: string): string {
  return ''
}
