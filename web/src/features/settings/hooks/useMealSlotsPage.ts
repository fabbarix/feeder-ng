import { useEffect, useMemo, useRef, useState } from 'react'
import { useMe } from '../../../app/useMe'
import { combineScreenStates } from '../../../lib/dataState'
import { undoStrings, useConfirm, useToast, useUndoToast } from '../../../ui'
import { resultMessage } from '../lib/multiDay'
import { createSlotsSequentially, slotFormFromCard, slotFormFromCell } from '../lib/slotForm'
import { slotAnchorId } from '../lib/slotAnchor'
import type { RemovedRow } from '../lib/removedMealSlots'
import { mergeImpacts, nameTakenRefusal, putBackRefusedHeadline, removalTarget, removedHeadline, removeGroups, removeLead, removeTitle, restoredHeadline, undoRemoveLabel } from '../lib/slotRemoval'
import { documentLocale } from '../lib/locale'
import { batchErrorMessage, errorMessage } from '../lib/errors'
import { nextDateForWeekday, todayIso, weekdayName } from '../lib/weekdays'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, DateCourseChange, MealSlot, MealSlotInput, SlotBatchRequest } from '../types'
import { useAttendance } from './useAttendance'
import { useCourses } from '../../../lib/courses/useCourses'
import { useSlotAnchor } from './useSlotAnchor'
import { useHouseholdLiveUpdates } from './useHouseholdLiveUpdates'
import { buildMealSlotCards, datesThatDiffer, type MealSlotCard } from '../lib/mealSlotCards'
import { useDateExceptions } from './useDateExceptions'
import { useMealSlots } from './useMealSlots'
import { useMembers } from './useMembers'

/** An open MealSlot sheet: adding (optionally on some weekdays) or editing one slot. */
interface SlotEditor {
  item?: MealSlot
  /** SET-14h, editing: the weekdays "Apply to" starts with (a card: every day of the name; a strip cell: that day). */
  initialWeekdays?: number[]
  defaultWeekdays?: number[]
  defaultName?: string
}

/** The Meal Slots page: the week, the slot sheet (an Admin), and the one-date Attendance a tap opens. */
export function useMealSlotsPage() {
  useHouseholdLiveUpdates()
  const toast = useToast()
  const undoToast = useUndoToast()
  const confirmer = useConfirm()
  const isAdmin = Boolean(useMe().data?.isAdmin)
  const members = useMembers()
  const slots = useMealSlots()
  const courses = useCourses()
  useSlotAnchor(slots.slots)
  const [editor, setEditor] = useState<SlotEditor | null>(null)
  const [dateEditor, setDateEditor] = useState<{ slot: MealSlot; date: string } | null>(null)
  const [error, setError] = useState<string>()
  /** Weekdays already saved from the open add sheet: a retry after a partial save does not create them again. */
  const savedWeekdays = useRef<number[]>([])
  const attendance = useAttendance(dateEditor?.slot.id ?? null, dateEditor?.date ?? null)
  /** SET-15: the key of the removed row being put back. */
  const [busyKey, setBusyKey] = useState<string | null>(null)
  /** A Meal Slot to focus once its card shows it (after Undo or Put back). */
  const [focusSlotId, setFocusSlotId] = useState<number | null>(null)
  useEffect(() => {
    if (focusSlotId === null) return
    const el = document.getElementById(slotAnchorId(focusSlotId))
    if (!el) return
    setFocusSlotId(null)
    el.focus()
  }, [focusSlotId, slots.slots])

  const openDate = (slot: MealSlot) => setDateEditor({ slot, date: nextDateForWeekday(slot.weekday, todayIso()) })

  /** A tap on a chip: an Admin gets the slot sheet (which leads to "Change a date"), a plain User the one-date Attendance. */
  const open = (slot: MealSlot) => {
    if (isAdmin) {
      setError(undefined)
      const start = slotFormFromCell(slot)
      setEditor({ item: start.slot, initialWeekdays: start.weekdays })
    } else {
      openDate(slot)
    }
  }

  /** Editing: one batch call for every chosen weekday (all or nothing), then a message that names any skipped day. */
  const apply = async (request: SlotBatchRequest) => {
    try {
      const result = await slots.batchUpdate(request)
      toast.show(
        resultMessage(request.set.name?.trim() || request.match, result.updated.map((s) => s.weekday), result.skipped.map((s) => s.weekday), documentLocale()),
        { status: 'success' },
      )
      setError(undefined)
      setEditor(null)
    } catch (err) {
      setError(batchErrorMessage(err))
    }
  }

  /** Adding: one Meal Slot per chosen weekday, in turn. Stops at the first failure. */
  const save = async (inputs: MealSlotInput[]) => {
    const pending = inputs.filter((input) => !savedWeekdays.current.includes(input.weekday))
    const result = await createSlotsSequentially(pending, slots.create)
    savedWeekdays.current = [...savedWeekdays.current, ...pending.slice(0, result.created).map((input) => input.weekday)]
    if (result.failedWeekday === undefined) {
      savedWeekdays.current = []
      setError(undefined)
      setEditor(null)
      return
    }
    const reason = result.error instanceof Error ? result.error.message : errorMessage(result.error)
    // The sheet stays open on the weekdays still to save (the saved ones leave the selection), so a retry cannot duplicate.
    setEditor({ defaultWeekdays: pending.slice(result.created).map((input) => input.weekday) })
    setError(settingsStrings.slot.partialSave(savedWeekdays.current.length, inputs.length, weekdayName(result.failedWeekday), reason))
  }

  /** A refused restore: a taken name gets the server's sentence and what to do (ruling 3); anything else the usual words. */
  const showRefusal = (headline: string, err: unknown) => {
    const taken = nameTakenRefusal(err)
    if (taken) toast.show({ status: 'warning', title: headline, subline: taken.subline, body: taken.body, sticky: true })
    else toast.show(errorMessage(err), { status: 'error' })
  }

  /**
   * SAFE-02 (decisions SAFE 4 and 7) and the B9-42 ruling: Remove acts on the days ticked in the sheet. Read what goes on each
   * (merged into one confirm), ask with the rows (Goes, Stays), remove them in one call, then one Undo toast that puts them all
   * back in one call. The page words its own refusal for a taken name, so "… is back" follows only a real restore. Unsaved edits
   * in the sheet go with it: the confirm is the question.
   */
  const remove = async (weekdays: number[]) => {
    const editing = editor?.item
    if (!editing) return
    const locale = documentLocale()
    const target = removalTarget(editing, weekdays, slots.slots)
    const ids = target.slots.map((s) => s.id)
    if (ids.length === 0) return
    let impact
    try {
      impact = mergeImpacts(await Promise.all(ids.map((id) => slots.impact(id))))
    } catch {
      toast.show(settingsStrings.removal.impactFailed, { status: 'error' })
      return
    }
    const ok = await confirmer.confirm({
      title: removeTitle(target, locale),
      body: removeLead(target),
      groups: removeGroups(impact, { today: todayIso(), locale }),
      confirmLabel: settingsStrings.removal.confirm,
      tone: 'danger',
    })
    if (!ok) return
    try {
      await slots.removeMany(ids)
    } catch (err) {
      setError(errorMessage(err))
      return
    }
    setError(undefined)
    setEditor(null)
    undoToast.show({
      headline: removedHeadline(target, locale),
      undoAriaLabel: undoRemoveLabel(target, locale),
      undo: async () => {
        try {
          await slots.restoreMany(ids)
        } catch (err) {
          if (!nameTakenRefusal(err)) throw err // useUndoToast says "Nothing was undone" with its own reason
          showRefusal(undoStrings.refusedHeadline, err)
          return
        }
        toast.show({ status: 'success', title: restoredHeadline(target, locale) })
        setFocusSlotId(ids[0]!)
      },
    })
  }

  /** SET-15: puts back every Meal Slot of the row in one call, all or nothing; then focus goes to the card. */
  const putBack = async (row: RemovedRow) => {
    if (busyKey !== null) return
    setBusyKey(row.key)
    try {
      await slots.restoreMany(row.ids)
      toast.show({ status: 'success', title: settingsStrings.removed.back(row.name) })
      setFocusSlotId(row.ids[0] ?? null)
    } catch (err) {
      showRefusal(putBackRefusedHeadline(row.name), err)
    } finally {
      setBusyKey(null)
    }
  }

  const saveDate = async (entries: AttendanceEntry[] | undefined, courses?: DateCourseChange[], guests?: number) => {
    try {
      await attendance.save(entries, courses, guests)
      toast.show(settingsStrings.attendanceSaved, { status: 'success' })
      setDateEditor(null)
    } catch (err) {
      toast.show(errorMessage(err, dateEditor?.slot.name), { status: 'error' })
    }
  }

  const resetDate = async () => {
    try {
      await attendance.reset()
      toast.show(settingsStrings.attendanceReset, { status: 'success' })
      setDateEditor(null)
    } catch (err) {
      toast.show(errorMessage(err, dateEditor?.slot.name), { status: 'error' })
    }
  }

  const exceptions = useDateExceptions()
  const loaded = !slots.isPending && !members.isPending
  // B9-20 (RES-02): the cards need both answers; offline and never loaded is offlineUnknown, never an empty page.
  const state = combineScreenStates(slots.state, members.state)
  const cards = useMemo<MealSlotCard[]>(
    () => (loaded ? buildMealSlotCards(slots.slots, members.members, { today: todayIso() }) : []),
    [loaded, slots.slots, members.members],
  )
  const dateRows = useMemo(() => datesThatDiffer(exceptions, { today: todayIso(), locale: documentLocale() }), [exceptions])
  /** "Change a date": the one-date Attendance of the card's soonest run; any User, an Admin included (the sheet gives way). */
  const changeDateOf = (card: MealSlotCard) => {
    setEditor(null)
    setDateEditor({ slot: card.next.slot, date: card.next.date })
  }

  return {
    isAdmin,
    /** True once the Meal Slots and the Members have loaded (the cards are derived from both). */
    loaded,
    /** B9-20 (RES-02): the cards' screen state (the Meal Slots' and the Members' together). */
    state,
    /** Fetches both again (the error state's Try again). */
    refetch: () => {
      slots.refetch()
      members.refetch()
    },
    /** MS: one card per Meal Slot name (empty until the Meal Slots and the Members have loaded). */
    cards,
    /** MS: the read-only "Dates that differ" rows. */
    dateRows,
    /** SET-14h: "Edit <name>" opens the sheet on the card's usual slot with every day of the name chosen (an Admin). */
    editCard: (card: MealSlotCard) => {
      setError(undefined)
      const start = slotFormFromCard(card)
      setEditor({ item: start.slot, initialWeekdays: start.weekdays })
    },
    /** MS: "Change a date for <name>" opens the one-date Attendance on the card's next run (any User). */
    changeDateOf,
    members,
    slots,
    /** CRS D2: the active Courses for the editor's field (empty until loaded). */
    courses: courses.choices,
    preview: slots.preview,
    editor,
    error,
    dateEditor,
    attendance,
    add: () => (setError(undefined), (savedWeekdays.current = []), setEditor({})),
    addOn: (weekday: number, name?: string) => (setError(undefined), (savedWeekdays.current = []), setEditor({ defaultWeekdays: [weekday], defaultName: name })),
    open,
    closeEditor: () => (savedWeekdays.current = [], setEditor(null)),
    /** "Change a date" from the sheet: the sheet gives way to the one-date Attendance for the same slot. */
    changeDate: () => {
      const slot = editor?.item
      if (!slot) return
      setEditor(null)
      openDate(slot)
    },
    save,
    apply,
    remove,
    /** SET-15: the removed Meal Slots with Cooked history, and Put back (an Admin). */
    removed: slots.removed,
    putBack,
    busyKey,
    dateChange: (date: string) => setDateEditor((d) => (d ? { ...d, date } : d)),
    closeDate: () => setDateEditor(null),
    saveDate,
    resetDate,
  }
}
