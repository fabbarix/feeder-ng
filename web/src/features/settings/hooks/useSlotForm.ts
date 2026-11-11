import { useEffect, useState, type FormEvent } from 'react'
import type { CourseChoice } from '../../../lib/courses'
import { sortIsoDays } from '../../../ui'
import { documentLocale } from '../lib/locale'
import { batchRequest, hasChanges, matchingSlots, quickPicks, summaryLines } from '../lib/multiDay'
import { slotDraft, slotFromDraft, slotInputsForWeekdays, slotProblem, weekdaysProblem } from '../lib/slotForm'
import { courseRemovals, coursesProblem, removalPreview, type RemovalPreview } from '../lib/slotCourses'
import { settingsStrings } from '../strings'
import type { MealSlot, MealSlotInput, Member, SlotBatchRequest, SlotBatchResult } from '../types'
import { useSlotPreview, type SlotPreviewState } from './useSlotPreview'

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
  /** CRS D2: the dry run of the batch, asked while a Course is taken off a matching slot. */
  onPreview?: (request: SlotBatchRequest) => Promise<SlotBatchResult>
  locale?: string
  onSave: (inputs: MealSlotInput[]) => void | Promise<void>
  onApply?: (request: SlotBatchRequest) => void | Promise<void>
}

type Problem = { message: string; field: 'weekdays' | 'form' }

const noPreview = (): Promise<SlotBatchResult> => Promise.reject(new Error('no preview'))

/** The Meal Slot sheet's state: the draft, the weekday selection, the matching "What will change" summary and the submit rules. */
export function useSlotForm({ slot, members, defaultWeekdays, defaultName, slots, courses, onPreview, locale = documentLocale(), onSave, onApply }: UseSlotFormOptions) {
  const [draft, setDraft] = useState<MealSlotInput>(() => {
    const d = slotDraft(slot, members, courses)
    return !slot && defaultName ? { ...d, name: defaultName } : d
  })
  const [weekdays, setWeekdays] = useState<number[]>(() => (slot ? [slot.weekday] : (defaultWeekdays ?? [])))
  // A partial save hands back the weekdays still to save: the selection follows them, the draft stays as typed.
  const weekdaysKey = (defaultWeekdays ?? []).join(',')
  useEffect(() => {
    if (!slot) setWeekdays(weekdaysKey === '' ? [] : weekdaysKey.split(',').map(Number))
  }, [weekdaysKey, slot])
  const [problem, setProblem] = useState<Problem | null>(null)
  /** Save was pressed at least once: the Courses problem is shown from then on. */
  const [attempted, setAttempted] = useState(false)
  const set = (patch: Partial<MealSlotInput>) => setDraft((d) => ({ ...d, ...patch }))
  const picks = quickPicks(slots ?? (slot ? [slot] : []), slot)
  const courseProblem = draft.courses ? coursesProblem(draft.courses) : null

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    setAttempted(true)
    const none = weekdaysProblem(weekdays)
    if (none) return setProblem({ message: none, field: 'weekdays' })
    const bad = slotProblem(draft)
    if (bad) return setProblem({ message: bad, field: 'form' })
    if (courseProblem) return setProblem(null)
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

  // CRS D2: taking a Course off a matching slot asks a dry run, so the summary can name what goes.
  const removals = slot && match && draft.courses ? courseRemovals(match.matched, draft.courses) : []
  const previewRequest = slot && removals.length > 0 && onPreview ? batchRequest(slot, weekdays, draft) : null
  const preview: SlotPreviewState = useSlotPreview(previewRequest, onPreview ?? noPreview)
  const removalLines: RemovalPreview | null = preview.status === 'ready' && preview.removes ? removalPreview(removals, preview.removes, locale) : null

  return {
    draft,
    set,
    weekdays,
    setWeekdays: (days: number[]) => setWeekdays(sortIsoDays(days)),
    picks,
    summary,
    problem,
    submit,
    /** The Courses problem, once Save was pressed (the picker shows it). */
    coursesError: attempted ? (courseProblem ?? undefined) : undefined,
    removal: { lines: removalLines, status: removals.length > 0 ? preview.status : 'idle' as const },
  }
}
