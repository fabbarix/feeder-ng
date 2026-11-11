import { useEffect, useState, type FormEvent } from 'react'
import type { CourseChoice } from '../../../lib/courses'
import { sortIsoDays } from '../../../ui'
import { documentLocale } from '../lib/locale'
import { batchRequest, hasChanges, matchingSlots, quickPicks, summaryLines } from '../lib/multiDay'
import { slotDraft, slotFromDraft, slotInputsForWeekdays, slotProblem, weekdaysProblem } from '../lib/slotForm'
import { settingsStrings } from '../strings'
import type { MealSlot, MealSlotInput, Member, SlotBatchRequest } from '../types'

export interface UseSlotFormOptions {
  slot?: MealSlot
  members: Member[]
  /** Add mode: the weekdays chosen at the start; a new value (after a partial save) replaces the selection. */
  defaultWeekdays?: number[]
  /** Add mode: the Name the draft starts with (the grid row whose add button was pressed). */
  defaultName?: string
  slots?: MealSlot[]
  /** CRS D2: the household's active Courses. Without them the form has no Courses field and sends none. */
  courses?: CourseChoice[]
  locale?: string
  onSave: (inputs: MealSlotInput[]) => void | Promise<void>
  onApply?: (request: SlotBatchRequest) => void | Promise<void>
}

type Problem = { message: string; field: 'weekdays' | 'form' }

/** The Meal Slot sheet's state: the draft, the weekday selection, the matching "What will change" summary and the submit rules. */
export function useSlotForm({ slot, members, defaultWeekdays, defaultName, slots, locale = documentLocale(), onSave, onApply }: UseSlotFormOptions) {
  const [draft, setDraft] = useState<MealSlotInput>(() => {
    const d = slotDraft(slot, members)
    return !slot && defaultName ? { ...d, name: defaultName } : d
  })
  const [weekdays, setWeekdays] = useState<number[]>(() => (slot ? [slot.weekday] : (defaultWeekdays ?? [])))
  // A partial save hands back the weekdays still to save: the selection follows them, the draft stays as typed.
  const weekdaysKey = (defaultWeekdays ?? []).join(',')
  useEffect(() => {
    if (!slot) setWeekdays(weekdaysKey === '' ? [] : weekdaysKey.split(',').map(Number))
  }, [weekdaysKey, slot])
  const [problem, setProblem] = useState<Problem | null>(null)
  const set = (patch: Partial<MealSlotInput>) => setDraft((d) => ({ ...d, ...patch }))
  const picks = quickPicks(slots ?? (slot ? [slot] : []), slot)

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const none = weekdaysProblem(weekdays)
    if (none) return setProblem({ message: none, field: 'weekdays' })
    const bad = slotProblem(draft)
    if (bad) return setProblem({ message: bad, field: 'form' })
    if (!slot) {
      setProblem(null)
      void onSave(slotInputsForWeekdays(draft, weekdays))
      return
    }
    if (!onApply) {
      void onSave([slotFromDraft({ ...draft, weekday: slot.weekday })])
      return
    }
    const request = batchRequest(slot, weekdays, draft)
    if (!hasChanges(request.set)) return setProblem({ message: settingsStrings.slot.nothingToChange, field: 'form' })
    setProblem(null)
    void onApply(request)
  }

  const match = slot ? matchingSlots(slots ?? [slot], slot.name, weekdays) : null
  const summary = slot && match ? summaryLines(slot.name.trim(), match.matched, match.skipped, locale) : null

  return {
    draft,
    set,
    weekdays,
    setWeekdays: (days: number[]) => setWeekdays(sortIsoDays(days)),
    picks,
    summary,
    problem,
    submit,
  }
}
