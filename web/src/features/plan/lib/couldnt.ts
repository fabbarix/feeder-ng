import type { PlanSlot } from '../types'

/** "Couldn't plan Thursday dinner: every option was excluded or in Cool-down." */
export function couldntPlanText(slot: PlanSlot): string {
  void [slot]
  throw new Error('TODO: developer')
}
