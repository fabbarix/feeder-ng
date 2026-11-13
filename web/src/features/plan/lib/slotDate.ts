// B5-F1 (ADR 0014): the per-date controls of a Meal Slot block. Plain TypeScript, no React.
// Which choices show, the Not served confirm built from the dry run, the captions. docs/dev/design/b5-f1.md.
import type { NotServedPreview, PlanSlot } from '../types'

/** Which per-date choices a slot block offers. All false on a past date. */
export interface DateChoices {
  /** "Who's eating": date today or later, and a Course is still to cook (or nothing is planned yet). */
  whosEating: boolean
  /** "Not served": as whosEating, and no Course of the slot is Cooked or Not cooked (U2). Never on a slot that is already Not served. */
  notServed: boolean
  /** "Time today" / "Time on Thu": as whosEating. */
  time: boolean
  /** "Plan Dinner again": the slot is Not served and the date is today or later. */
  planAgain: boolean
}

export function dateChoices(_slot: PlanSlot, _today: string): DateChoices {
  return { whosEating: false, notServed: false, time: false, planAgain: false }
}

/** True when the slot is Not served on its date (`slot.notServed`). */
export function isNotServed(_slot: PlanSlot): boolean {
  return false
}

/** "Thu Dinner": the short weekday of the slot's date and the Meal Slot name. */
export function slotDayName(_slot: PlanSlot): string {
  return ''
}

/** "Time today" when the slot's date is `today`, else "Time on Thu". */
export function timeChoiceLabel(_slot: PlanSlot, _today: string): string {
  return ''
}

/** The label of a date choice: as given online, "<label> · Needs a connection" offline. */
export function choiceLabel(_label: string, _offline: boolean): string {
  return ''
}

export interface ConfirmCopy {
  title: string
  body: string
  confirmLabel: string
}

/** The Not served confirm: title, a body naming what goes (Pinned, Bought), and the confirm label. */
export function notServedConfirm(_slot: PlanSlot, _preview: NotServedPreview): ConfirmCopy {
  return { title: '', body: '', confirmLabel: '' }
}

/** True when the dry run lists Planned Meals: only then is a confirm asked. */
export function needsNotServedConfirm(_preview: NotServedPreview): boolean {
  return false
}

/** The toast after Not served: "Thu Dinner is not served" (its action is Undo). */
export function notServedToastText(_slot: PlanSlot): string {
  return ''
}

/** The compact row: "Dinner · Not served". */
export function notServedRowText(_slot: PlanSlot): string {
  return ''
}

/** "Plan Dinner again". */
export function planAgainLabel(_slot: PlanSlot): string {
  return ''
}

/** "20:15 · usually 19:30" when the date has its own time; null when it has the usual one (or the slot does not say). */
export function timeCaption(_slot: PlanSlot): string | null {
  return null
}

/** True when the date has a time of its own (`usualTime` known and different from `time`). */
export function hasOwnTime(_slot: PlanSlot): boolean {
  return false
}

export interface TimeDialogCopy {
  title: string
  label: string
  helper: string
  /** "Back to 19:30", only when the date has its own time. */
  back: string | null
}

export function timeDialogCopy(_slot: PlanSlot): TimeDialogCopy {
  return { title: '', label: '', helper: '', back: null }
}

/** Save is offered for a complete "HH:MM" that is not the time the slot already has. */
export function canSaveTime(_slot: PlanSlot, _draft: string): boolean {
  return false
}

/** "+2 Guests", "+1 Guest"; '' for none. */
export function guestsSuffix(_guests: number): string {
  return ''
}

/** "Anna, Sam + 2 Guests"; "2 Guests" with no Member; the names alone with none. */
export function attendeesLine(_names: string[], _guests: number): string {
  return ''
}

/** The Not served slots of `today`, in time order: Today's compact rows. Slots of other dates are left out. */
export function notServedToday(_slots: PlanSlot[], _today: string): PlanSlot[] {
  return []
}

/** The words for a refused PATCH / PUT: date_past, slot_started, time_invalid; anything else the generic "Could not save that". */
export function slotDateErrorText(_err: unknown, _slot: PlanSlot | null): string {
  return ''
}
