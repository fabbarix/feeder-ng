// B5-F1: the Plan page's `?mark=<date>:<slot>` parameter: once the plan has loaded it opens the slot's Mark as Cooked sheet (one Course
// to cook) or Mark all Cooked sheet (several) through the screen's own flows, then leaves when the sheet closes. usePlanScreen calls it.
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../../../ui'
import { planApi } from '../api'
import { markSlotTarget, parseMarkSlotParam } from '../lib/markSlot'
import { planStrings } from '../strings'
import type { AllCookedFlow } from './useAllCookedFlow'
import type { CookFlow } from './useCookFlow'

export interface MarkSlotRouteInput {
  flow: CookFlow
  allCooked: AllCookedFlow
}

export interface MarkSlotRoute {
  /** The address names a slot to mark (the parameter is present and well formed). */
  active: boolean
}

/**
 * Reads `mark` from the address. A malformed value is dropped. The marked date is fetched on its own (planApi.view(date, date), once):
 * plain /api/plan starts at today, so an earlier day's slot is never in the Plan's own view. A slot with nothing left to mark toasts
 * "Nothing is left to mark Cooked there." and leaves at once. Leaving goes back one step when the app was opened from somewhere else
 * (the Shopping List), else to /plan without the parameter. It leaves when the open sheet closes or the Cooked is saved, and does not
 * reopen on a refetch.
 */
export function useMarkSlotRoute({ flow, allCooked }: MarkSlotRouteInput): MarkSlotRoute {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const key = parseMarkSlotParam(params.get('mark'))
  const date = key?.date ?? ''
  const marked = useQuery({
    queryKey: ['plan', 'mark', date],
    queryFn: () => planApi.view(date, date),
    enabled: key !== null,
  })
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
    if (key === null || marked.data === undefined || handled.current) return
    handled.current = true
    const slot = marked.data.slots.find((s) => s.date === key.date && s.mealSlotId === key.mealSlotId)
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
    // Runs once per address: a refetch must not reopen the sheet.
  }, [key, marked.data])

  useEffect(() => {
    if (!opened.current || sheetOpen || left.current) return
    left.current = true
    leave()
  }, [sheetOpen])

  return { active: key !== null }
}
