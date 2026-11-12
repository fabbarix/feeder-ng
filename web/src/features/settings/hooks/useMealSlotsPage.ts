import { useRef, useState } from 'react'
import { useMe } from '../../../app/useMe'
import { useToast } from '../../../ui'
import { resultMessage } from '../lib/multiDay'
import { createSlotsSequentially } from '../lib/slotForm'
import { documentLocale } from '../lib/locale'
import { batchErrorMessage, errorMessage } from '../lib/errors'
import { nextDateForWeekday, todayIso, weekdayName } from '../lib/weekdays'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, DateCourseChange, MealSlot, MealSlotInput, SlotBatchRequest } from '../types'
import { useAttendance } from './useAttendance'
import { useCourses } from '../../../lib/courses/useCourses'
import { useSlotAnchor } from './useSlotAnchor'
import { useHouseholdLiveUpdates } from './useHouseholdLiveUpdates'
import type { DateRow, MealSlotCard } from '../lib/mealSlotCards'
import { useDateExceptions } from './useDateExceptions'
import { useMealSlots } from './useMealSlots'
import { useMembers } from './useMembers'

/** An open MealSlot sheet: adding (optionally on some weekdays) or editing one slot. */
interface SlotEditor {
  item?: MealSlot
  defaultWeekdays?: number[]
  defaultName?: string
}

/** The Meal Slots page: the week, the slot sheet (an Admin), and the one-date Attendance a tap opens. */
export function useMealSlotsPage() {
  useHouseholdLiveUpdates()
  const toast = useToast()
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

  const openDate = (slot: MealSlot) => setDateEditor({ slot, date: nextDateForWeekday(slot.weekday, todayIso()) })

  /** A tap on a chip: an Admin gets the slot sheet (which leads to "Change a date"), a plain User the one-date Attendance. */
  const open = (slot: MealSlot) => {
    if (isAdmin) {
      setError(undefined)
      setEditor({ item: slot })
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

  const remove = async () => {
    const editing = editor?.item
    if (!editing) return
    try {
      await slots.remove(editing.id)
      setError(undefined)
      setEditor(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const saveDate = async (entries: AttendanceEntry[] | undefined, courses?: DateCourseChange[]) => {
    try {
      await attendance.save(entries, courses)
      toast.show(settingsStrings.attendanceSaved, { status: 'success' })
      setDateEditor(null)
    } catch (err) {
      toast.show(errorMessage(err), { status: 'error' })
    }
  }

  const resetDate = async () => {
    try {
      await attendance.reset()
      toast.show(settingsStrings.attendanceReset, { status: 'success' })
      setDateEditor(null)
    } catch (err) {
      toast.show(errorMessage(err), { status: 'error' })
    }
  }

  // STUB (test-first): the developer derives these with buildMealSlotCards / datesThatDiffer (todayIso(), documentLocale(), the Members).
  const cards: MealSlotCard[] = []
  const dateRows: DateRow[] = []
  useDateExceptions()
  const editCard = (_card: MealSlotCard) => {}
  const changeDateOf = (_card: MealSlotCard) => {}

  return {
    isAdmin,
    /** MS: one card per Meal Slot name (empty until the Meal Slots and the Members have loaded). */
    cards,
    /** MS: the read-only "Dates that differ" rows. */
    dateRows,
    /** MS: "Edit <name>" opens the sheet on the card's usual slot (an Admin). */
    editCard,
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
    dateChange: (date: string) => setDateEditor((d) => (d ? { ...d, date } : d)),
    closeDate: () => setDateEditor(null),
    saveDate,
    resetDate,
  }
}
