// B5-F1: the Plan page's `?mark=<date>:<slot>` parameter: once the plan has loaded it opens the slot's Mark as Cooked sheet (one Course
// to cook) or Mark all Cooked sheet (several) through the screen's own flows, then leaves when the sheet closes. usePlanScreen calls it.
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../../../ui'
import { markSlotTarget, parseMarkSlotParam } from '../lib/markSlot'
import { planStrings } from '../strings'
import type { PlanSlot } from '../types'
import type { AllCookedFlow } from './useAllCookedFlow'
import type { CookFlow } from './useCookFlow'

export interface MarkSlotRouteInput {
  slots: PlanSlot[]
  /** The plan has loaded (an empty slot list before that must not read as "no such slot"). */
  loaded: boolean
  flow: CookFlow
  allCooked: AllCookedFlow
}

export interface MarkSlotRoute {
  /** The address names a slot to mark (the parameter is present and well formed). */
  active: boolean
}

/**
 * Reads `mark` from the address. A malformed value is dropped. A slot with nothing left to mark toasts "Nothing is left to mark Cooked
 * there." and leaves at once. Leaving goes back one step when the app was opened from somewhere else (the Shopping List), else to /plan
 * without the parameter. It leaves when the open sheet closes or the Cooked is saved, and does not reopen on a refetch.
 */
export function useMarkSlotRoute({ slots, loaded, flow, allCooked }: MarkSlotRouteInput): MarkSlotRoute {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const key = parseMarkSlotParam(params.get('mark'))
  const handled = useRef(false)
  const opened = useRef(false)
  const left = useRef(false)
  const sheetOpen = flow.cookKey !== null || allCooked.key !== null

  const leave = () => {
    // A key other than the first entry's means the app navigated here (the Shopping List's "Mark it"): go back one step.
    if (location.key !== 'default') navigate(-1)
    else navigate('/plan', { replace: true })
  }

  useEffect(() => {
    if (key === null || !loaded || handled.current) return
    handled.current = true
    const slot = slots.find((s) => s.date === key.date && s.mealSlotId === key.mealSlotId)
    const target = markSlotTarget(slot)
    if (target.kind === 'none') {
      toast.show(planStrings.markSlot.nothingLeft)
      left.current = true
      leave()
      return
    }
    opened.current = true
    if (target.kind === 'one') flow.open(target.key)
    else allCooked.open(target.slot, target.courseIds)
    // Runs once per address: a refetch of the plan must not reopen the sheet.
  }, [key, loaded, slots])

  useEffect(() => {
    if (!opened.current || sheetOpen || left.current) return
    left.current = true
    leave()
  }, [sheetOpen])

  return { active: key !== null }
}
