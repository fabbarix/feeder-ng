// B5-F1 (ADR 0014): the per-date choices of a Meal Slot block, shared by Plan and Today. Orchestration only (API, confirm, toast,
// refetch); the rules and the words are in lib/slotDate. docs/dev/design/b5-f1.md.
import type { PlanSlot, SlotDateActions, SlotDayKey } from '../types'

/** Who's eating is the Settings feature's Date Attendance sheet (WhosEatingSheet); this hook decides when it is open and what surrounds an emptied date. */
export interface WhosEatingControl {
  /** The slot and date the sheet is open for, or null. */
  target: SlotDayKey | null
  close: () => void
  /** Called by the sheet before it saves an emptied date (no Member, no Guest): the Not served confirm when Planned Meals go. true = go on. */
  beforeEmptying: (target: SlotDayKey) => Promise<boolean>
  /** Called after an emptied date was saved: the same toast as Not served, with Undo. */
  onEmptied: (target: SlotDayKey) => void
}

export interface SlotDateController {
  /** The handlers for SlotMenu, MealTile and TonightHero. */
  actions: SlotDateActions
  /** The slot whose Time dialog is open, or null. */
  timeSlot: PlanSlot | null
  closeTime: () => void
  /** PATCH { time }, close the dialog on success. */
  saveTime: (time: string) => Promise<boolean>
  /** PATCH { time: null } (Back to the usual time), close the dialog on success. */
  backToUsual: () => Promise<boolean>
  whosEating: WhosEatingControl
  /** A PATCH is running. */
  busy: boolean
}

/** `slots` resolve the keys to names and times; `today` is the household date. */
export function useSlotDate(_slots: PlanSlot[], _today: string): SlotDateController {
  const none = () => {}
  return {
    actions: { offline: false, onWhosEating: none, onNotServed: none, onTime: none, onPlanAgain: none },
    timeSlot: null,
    closeTime: none,
    saveTime: async () => false,
    backToUsual: async () => false,
    whosEating: { target: null, close: none, beforeEmptying: async () => true, onEmptied: none },
    busy: false,
  }
}
