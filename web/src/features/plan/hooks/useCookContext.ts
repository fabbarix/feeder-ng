// The Unit System and the household's date for the Used from section (docs/dev/design/b5-ufw.md §2).
import { useQuery } from '@tanstack/react-query'
import type { UnitSystem } from '../../../lib/units'
import { usePreferences } from '../../settings/hooks/usePreferences'
import type { PlanView } from '../types'

export interface CookContext {
  unitSystem: UnitSystem
  /** The household's date, YYYY-MM-DD. */
  today: string
}

/** The local calendar date as YYYY-MM-DD. */
function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * The display Unit System (the signed-in User's `units` preference, read only while `enabled`, so an idle sheet makes
 * no request), and the plan view's `today` when ['plan', 'view'] is cached (no fetch of its own).
 */
export function useCookContext(enabled = true): CookContext {
  const unitSystem = usePreferences(enabled).preferences.units
  const view = useQuery<PlanView>({ queryKey: ['plan', 'view'], enabled: false })
  return { unitSystem, today: view.data?.today ?? localToday() }
}
