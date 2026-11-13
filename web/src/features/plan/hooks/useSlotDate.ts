// B5-F1 (ADR 0014): the per-date choices of a Meal Slot block, shared by Plan and Today. Orchestration only (API, confirm, toast,
// refetch); the rules and the words are in lib/slotDate. docs/dev/design/b5-f1.md.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConnectivity } from '../../../app/useConnectivity'
import { useConfirm, useToast } from '../../../ui'
import { planApi } from '../api'
import { planStrings } from '../strings'
import { needsNotServedConfirm, notServedConfirm, notServedToastText, slotDateErrorText } from '../lib/slotDate'
import type { PlanSlot, SlotDateActions, SlotDatePatch, SlotDayKey } from '../types'
import { invalidatePlan } from './planCache'

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

function sameSlot(a: SlotDayKey, b: SlotDayKey): boolean {
  return a.date === b.date && a.mealSlotId === b.mealSlotId
}

/** `slots` resolve the keys to names and times; `today` is the household date. */
export function useSlotDate(slots: PlanSlot[], _today: string): SlotDateController {
  const client = useQueryClient()
  const confirm = useConfirm()
  const toast = useToast()
  const { offline } = useConnectivity()
  const [timeKey, setTimeKey] = useState<SlotDayKey | null>(null)
  const [whosKey, setWhosKey] = useState<SlotDayKey | null>(null)
  const [busy, setBusy] = useState(false)

  const find = (key: SlotDayKey): PlanSlot | null => slots.find((sl) => sameSlot(sl, key)) ?? null
  const timeSlot = timeKey ? find(timeKey) : null

  /** One PATCH of the date; a refusal toasts its words and resolves false. */
  const patch = async (key: SlotDayKey, body: SlotDatePatch): Promise<boolean> => {
    setBusy(true)
    try {
      await planApi.patchSlotDate(key.mealSlotId, key.date, body)
      void invalidatePlan(client)
      return true
    } catch (err) {
      toast.show(slotDateErrorText(err, find(key)))
      return false
    } finally {
      setBusy(false)
    }
  }

  /** The dry run: what Not served would remove; a refusal toasts its words and resolves null. */
  const preview = async (key: SlotDayKey) => {
    try {
      return await planApi.notServedPreview(key.mealSlotId, key.date)
    } catch (err) {
      toast.show(slotDateErrorText(err, find(key)))
      return null
    }
  }

  /** The toast's Undo serves the date again (notServed false). */
  const undoOptions = (key: SlotDayKey) => ({ actionLabel: planStrings.undo, onAction: () => void patch(key, { notServed: false }) })

  const notServed = async (key: SlotDayKey) => {
    const slot = find(key)
    if (offline || !slot) return
    const pv = await preview(key)
    if (!pv) return
    if (needsNotServedConfirm(pv) && !(await confirm.confirm(notServedConfirm(slot, pv)))) return
    if (await patch(key, { notServed: true })) {
      toast.show(notServedToastText(slot), undoOptions(key))
    }
  }

  const planAgain = async (key: SlotDayKey) => {
    if (offline) return
    await patch(key, { notServed: false })
  }

  const saveTime = async (time: string): Promise<boolean> => {
    if (!timeKey) return false
    const ok = await patch(timeKey, { time })
    if (ok) setTimeKey(null)
    return ok
  }

  const backToUsual = async (): Promise<boolean> => {
    if (!timeKey) return false
    const ok = await patch(timeKey, { time: null })
    if (ok) setTimeKey(null)
    return ok
  }

  const beforeEmptying = async (target: SlotDayKey): Promise<boolean> => {
    const slot = find(target)
    if (!slot) return true
    const pv = await preview(target)
    if (!pv) return false
    if (!needsNotServedConfirm(pv)) return true
    return confirm.confirm(notServedConfirm(slot, pv))
  }

  const onEmptied = (target: SlotDayKey) => {
    const slot = find(target)
    void invalidatePlan(client)
    if (!slot) return
    toast.show(notServedToastText(slot), undoOptions(target))
  }

  return {
    actions: {
      offline,
      onWhosEating: (key) => {
        if (!offline) setWhosKey(key)
      },
      onNotServed: (key) => void notServed(key),
      onTime: (key) => {
        if (!offline) setTimeKey(key)
      },
      onPlanAgain: (key) => void planAgain(key),
    },
    timeSlot,
    closeTime: () => setTimeKey(null),
    saveTime,
    backToUsual,
    whosEating: {
      target: whosKey,
      close: () => setWhosKey(null),
      beforeEmptying,
      onEmptied,
    },
    busy,
  }
}
