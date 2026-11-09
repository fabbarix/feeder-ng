import { planStrings as s } from '../strings'
import type { PlanSlot } from '../types'
import { weekdayName } from './phrase'

function join(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return s.listOr(parts.slice(0, -1).join(', '), parts[parts.length - 1]!)
}

/** "Couldn't plan Thursday dinner: every option was excluded or in Cool-down." */
export function couldntPlanText(slot: PlanSlot): string {
  const head = s.couldntPlanSlot(`${weekdayName(slot.date)} ${slot.name.toLowerCase()}`)
  const u = slot.unfilled
  if (!u || u.reason === 'no_attendance') return s.couldntNobodyAttending(head)
  if (u.slotRuleClaimed) return s.couldntSlotRuleUnavailable(head)
  const e = u.eliminated
  if (e.considered === 0) return s.couldntNoRecipes(head)
  const parts: string[] = []
  if (e.exclusion > 0) parts.push(s.couldntExcluded)
  if (e.coolDown > 0) parts.push(s.couldntInCoolDown)
  if (e.varietyRule > 0) parts.push(s.couldntVarietyRule)
  if (e.advanceStep > 0) parts.push(s.couldntAdvanceStepLate)
  if (parts.length === 0) return s.couldntNoRecipeFits(head)
  return s.couldntEveryOption(head, join(parts))
}
