// B9-46 (PC-08, SET-16): the words and models of an Away, plain TypeScript with no React. Wording follows the chapter's mocks.
// TEST-AUTHOR STUB: every function throws until the developer builds it (the tests in away.test.ts pin each one).
import type { Away, AwayDraft, AwayPreview, AwaySlotRef, PlanSlot } from '../types'

const todo = (name: string): never => {
  throw new Error(`not implemented (B9-46): ${name}`)
}

/** "0.5 portions", "1 portion", "1.75 portions": the number without trailing zeros. */
export const formatPortions = (_n: number): string => todo('formatPortions')

/** "Tue 17 – Thu 19 Nov", "Fri 27 Nov – Tue 1 Dec", "Tue 17 Nov" (one day), "From Tue 1 Dec" (no last day yet); the year only when it differs. */
export const awayRange = (_a: Pick<Away, 'from' | 'through'>): string => todo('awayRange')

/** The range in Who's eating's away row, under the date's own context: "Tue 17 – Thu 19" (no month when both days are in one), "Fri 27 Nov – Tue 1 Dec", "Tue 17", "from Tue 1 Dec". The row says "Away " before it. */
export const awayRangeShort = (_a: Pick<Away, 'from' | 'through'>): string => todo('awayRangeShort')

/** The compact range used in names: "12–19 Nov", "27 Nov – 1 Dec", "12 Nov", "from 1 Dec". */
export const awayCompact = (_a: Pick<Away, 'from' | 'through'>): string => todo('awayCompact')

/** The toast's subline: "Tue 17 Breakfast – Thu 19 Dinner" (a whole-day end names the day's first or last Meal Slot). */
export const awaySpan = (_a: Pick<Away, 'from' | 'fromMealSlotId' | 'through' | 'throughMealSlotId'>, _slots: AwaySlotRef[]): string => todo('awaySpan')

export interface AwayOption {
  /** '' is the whole day; otherwise the Meal Slot id as a string. */
  value: string
  label: string
}
/** The options of the From (`first`) or Through (`last`) select for a date: "Breakfast (whole day)", "Lunch", "Dinner"; [] when no Meal Slot is on that weekday. */
export const awaySlotOptions = (_date: string, _slots: AwaySlotRef[], _edge: 'first' | 'last'): AwayOption[] => todo('awaySlotOptions')

export interface AwayDayLine {
  memberId: number
  awayId: number
  /** "Ben away all day · 1.75 portions". */
  text: string
}
export interface AwayDayModel {
  /** One line per Member who is away at every served Meal Slot of the day, under the day's name. */
  lines: AwayDayLine[]
  /** By Meal Slot id: "Ben away" (a part-day Away), or "Everyone is away" (everyone: true). */
  slotLabels: Record<number, { text: string; everyone: boolean }>
}
type DaySlot = Pick<PlanSlot, 'mealSlotId' | 'portions'> & Partial<Pick<PlanSlot, 'guests' | 'away' | 'everyoneAway' | 'notServed'>>
/** What a day tile says about Aways (the day's slots, the plan's Aways). */
export const awayDayModel = (_slots: DaySlot[], _aways: Away[]): AwayDayModel => todo('awayDayModel')

export interface AwayPreviewRow {
  key: string
  state: string
  detail: string
}
export interface AwayPreviewModel {
  summary: string
  rows: AwayPreviewRow[]
  note: string | null
}
/** The "What changes" disclosure: its summary row, the R-E rows by day plus "Unchanged", and the note past the plan. `planEnd` is the plan's last date. */
export const awayPreviewModel = (_p: AwayPreview, _ctx: { name: string; planEnd: string }): AwayPreviewModel => todo('awayPreviewModel')

/** The toast's body: "6 meals changed to 1.75 portions: Tue Breakfast, Lunch and Dinner; Wed Dinner."; null when no meal changes. */
export const awayChangedBody = (_p: AwayPreview): string | null => todo('awayChangedBody')

export interface AwayToastWords {
  headline: string
  subline?: string
  body?: string
  /** The 4 s line after a successful Undo. */
  restored?: string
}
export const awayToast = (_kind: 'created' | 'changed' | 'ended' | 'removed', _ctx: { away: Away; slots: AwaySlotRef[]; preview?: AwayPreview | null; today: string }): AwayToastWords => todo('awayToast')

export const awaySheetTitle = (_fixedMemberName?: string): string => todo('awaySheetTitle')
/** The context line under the title; `from` is "Tue 17 Breakfast". null when there is nothing to say. */
export const awaySheetContext = (_x: { memberName?: string; away?: Pick<Away, 'from' | 'through'>; from?: string }): string | null => todo('awaySheetContext')
/** The footer of the sheet: the primary's label and the one extra action (End today once started, Remove Away before). */
export const awayFooter = (_away: Pick<Away, 'started'> | null): { save: string; extra: null | 'end' | 'remove' } => todo('awayFooter')
/** The accessible names of the two extra actions: "Remove Away 12–19 Nov for Ben", "End today: Away 12–19 Nov for Ben". */
export const awayButtonNames = (_away: Pick<Away, 'from' | 'through' | 'memberName'>): { remove: string; end: string } => todo('awayButtonNames')

export const awayDraft = (_x: { today: string; slots: AwaySlotRef[]; memberId?: number; from?: { date: string; mealSlotId: number }; away?: Away }): AwayDraft => todo('awayDraft')
/** The request body of a create or a PATCH. A started Away's PATCH leaves the first day out; "No last day yet" is `through: null` in a PATCH and absent in a create. */
export const awayBody = (_d: AwayDraft, _mode: 'create' | 'patch', _opts?: { started?: boolean }): Record<string, unknown> => todo('awayBody')
