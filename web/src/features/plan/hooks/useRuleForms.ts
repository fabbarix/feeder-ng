import { useState } from 'react'
import { defaultCourseId, slotCourseChoices, toSlotRuleBody, toVarietyRule, type SlotRuleDraftError, type VarietyDraftError } from '../lib/rules'
import { planStrings } from '../strings'
import type { CourseChoice } from '../../../lib/courses/types'
import type { MealSlotChoice, VarietyRule } from '../types'

const slotErrors: Record<SlotRuleDraftError, string> = {
  meal_slot_required: planStrings.errorMealSlotRequired,
  tag_required: planStrings.errorTagRequired,
  recipe_required: planStrings.errorRecipeRequired,
}

const varietyErrors: Record<VarietyDraftError, string> = {
  tag_required: planStrings.errorTagRequired,
  nothing_limited: planStrings.errorNothingLimited,
  max_range: planStrings.errorMaxRange,
}

export interface SlotRuleForm {
  mealSlotId: string
  kind: 'recipe' | 'tag'
  recipeId: string
  tag: string
  /** TG-PW: the chosen Course as a string; the main Course of the chosen slot until another is picked. */
  courseId: string
  /** TG-PW: the chosen Meal Slot's Courses, for the Course select. */
  courses: CourseChoice[]
  /** TG-PW: the Course select shows only when the slot has several Courses. */
  showCourse: boolean
  setCourseId: (v: string) => void
  setMealSlotId: (v: string) => void
  setKind: (v: 'recipe' | 'tag') => void
  setRecipeId: (v: string) => void
  setTag: (v: string) => void
  error: string | null
  submit: () => void
}

/** Form state of the Slot Rule editor; the Meal Slot defaults to the first one. */
export function useSlotRuleForm(
  mealSlots: MealSlotChoice[],
  onAdd: (body: { mealSlotId: number; courseId?: number; recipeId?: number; tag?: string }) => void,
): SlotRuleForm {
  const [mealSlotId, setMealSlotId] = useState('')
  const [kind, setKind] = useState<'recipe' | 'tag'>('recipe')
  const [recipeId, setRecipeId] = useState('')
  const [tag, setTag] = useState('')
  /** TG-PW: the Course picked on the current slot; '' = the slot's main Course. Cleared when the slot changes. */
  const [pickedCourse, setPickedCourse] = useState('')
  const [error, setError] = useState<string | null>(null)
  const effectiveSlot = mealSlotId || (mealSlots[0] ? String(mealSlots[0].id) : '')
  const slot = mealSlots.find((m) => String(m.id) === effectiveSlot)
  const courses = slotCourseChoices(slot)
  const showCourse = courses.length > 1
  const courseId = showCourse ? pickedCourse || defaultCourseId(slot) : ''

  const changeSlot = (v: string) => {
    setMealSlotId(v)
    setPickedCourse('')
  }

  const submit = () => {
    const res = toSlotRuleBody({ mealSlotId: effectiveSlot, kind, recipeId, tag, courseId })
    if ('error' in res) {
      setError(slotErrors[res.error])
      return
    }
    setError(null)
    onAdd(res.body)
    setTag('')
  }
  return {
    mealSlotId: effectiveSlot,
    kind,
    recipeId,
    tag,
    courseId,
    courses,
    showCourse,
    setCourseId: setPickedCourse,
    setMealSlotId: changeSlot,
    setKind,
    setRecipeId,
    setTag,
    error,
    submit,
  }
}

export interface VarietyRuleForm {
  tag: string
  /** The weekly limit; null = no cap. */
  maxPerWeek: number | null
  notConsecutiveDays: boolean
  setTag: (v: string) => void
  setMaxPerWeek: (v: number | null) => void
  setNotConsecutiveDays: (v: boolean) => void
  error: string | null
  submit: () => void
}

export function useVarietyRuleForm(onSave: (rule: VarietyRule) => void): VarietyRuleForm {
  const [tag, setTag] = useState('')
  const [maxPerWeek, setMaxPerWeek] = useState<number | null>(1)
  const [notConsecutiveDays, setNotConsecutiveDays] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const res = toVarietyRule({ tag, maxPerWeek, notConsecutiveDays })
    if ('error' in res) {
      setError(varietyErrors[res.error])
      return
    }
    setError(null)
    onSave(res.rule)
    setTag('')
    setMaxPerWeek(1)
    setNotConsecutiveDays(false)
  }
  return { tag, maxPerWeek, notConsecutiveDays, setTag, setMaxPerWeek, setNotConsecutiveDays, error, submit }
}
