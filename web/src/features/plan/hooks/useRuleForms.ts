import { useRef, useState, type RefObject } from 'react'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { defaultCourseId, slotCourseChoices, toSlotRuleBody, toVarietyRule } from '../lib/rules'
import { hasFieldErrors, slotRuleFieldErrors, varietyRuleFieldErrors, type SlotRuleFieldErrors, type VarietyRuleFieldErrors } from '../lib/ruleForms'
import type { CourseChoice } from '../../../lib/courses/types'
import type { MealSlotChoice, VarietyRule } from '../types'

const NO_ERRORS = {}

export interface SlotRuleForm {
  /** SAFE-04: the form element; after a failed submit focus goes to its first invalid field. */
  formRef: RefObject<HTMLFormElement | null>
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
  /** SAFE-04: each field's own error, shown at the field once a submit failed, and gone as soon as the field is fixed. */
  errors: SlotRuleFieldErrors
  submit: () => void
}

/** Form state of the Slot Rule editor; the Meal Slot defaults to the first one. */
export function useSlotRuleForm(
  mealSlots: MealSlotChoice[],
  onAdd: (body: { mealSlotId: number; courseId?: number; recipeId?: number; tag?: string }) => void,
): SlotRuleForm {
  const formRef = useRef<HTMLFormElement>(null)
  const [mealSlotId, setMealSlotId] = useState('')
  const [kind, setKind] = useState<'recipe' | 'tag'>('recipe')
  const [recipeId, setRecipeId] = useState('')
  const [tag, setTag] = useState('')
  /** TG-PW: the Course picked on the current slot; '' = the slot's main Course. Cleared when the slot changes. */
  const [pickedCourse, setPickedCourse] = useState('')
  const [submitCount, setSubmitCount] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const effectiveSlot = mealSlotId || (mealSlots[0] ? String(mealSlots[0].id) : '')
  const slot = mealSlots.find((m) => String(m.id) === effectiveSlot)
  const courses = slotCourseChoices(slot)
  const showCourse = courses.length > 1
  const courseId = showCourse ? pickedCourse || defaultCourseId(slot) : ''
  const draft = { mealSlotId: effectiveSlot, kind, recipeId, tag, courseId }
  const errors = showErrors ? slotRuleFieldErrors(draft) : NO_ERRORS
  useFocusFirstInvalid(formRef, errors, submitCount)

  const changeSlot = (v: string) => {
    setMealSlotId(v)
    setPickedCourse('')
  }

  const submit = () => {
    setSubmitCount((n) => n + 1)
    const res = toSlotRuleBody(draft)
    if (hasFieldErrors(slotRuleFieldErrors(draft)) || 'error' in res) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    onAdd(res.body)
    setTag('')
  }
  return {
    formRef,
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
    errors,
    submit,
  }
}

export interface VarietyRuleForm {
  formRef: RefObject<HTMLFormElement | null>
  tag: string
  /** The weekly limit; null = no cap. */
  maxPerWeek: number | null
  notConsecutiveDays: boolean
  setTag: (v: string) => void
  setMaxPerWeek: (v: number | null) => void
  setNotConsecutiveDays: (v: boolean) => void
  /** SAFE-04: the Tag's and the weekly limit's own errors, after a failed submit, live until fixed. */
  errors: VarietyRuleFieldErrors
  submit: () => void
}

export function useVarietyRuleForm(onSave: (rule: VarietyRule) => void): VarietyRuleForm {
  const formRef = useRef<HTMLFormElement>(null)
  const [tag, setTag] = useState('')
  const [maxPerWeek, setMaxPerWeek] = useState<number | null>(1)
  const [notConsecutiveDays, setNotConsecutiveDays] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const draft = { tag, maxPerWeek, notConsecutiveDays }
  const errors = showErrors ? varietyRuleFieldErrors(draft) : NO_ERRORS
  useFocusFirstInvalid(formRef, errors, submitCount)

  const submit = () => {
    setSubmitCount((n) => n + 1)
    const res = toVarietyRule(draft)
    if (hasFieldErrors(varietyRuleFieldErrors(draft)) || 'error' in res) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    onSave(res.rule)
    setTag('')
    setMaxPerWeek(1)
    setNotConsecutiveDays(false)
  }
  return { formRef, tag, maxPerWeek, notConsecutiveDays, setTag, setMaxPerWeek, setNotConsecutiveDays, errors, submit }
}
