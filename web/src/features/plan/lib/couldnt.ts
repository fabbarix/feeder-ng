import type { PlanSlot } from '../types'
import { weekdayName } from './phrase'

function join(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`
}

/** "Couldn't plan Thursday dinner: every option was excluded or in Cool-down." */
export function couldntPlanText(slot: PlanSlot): string {
  const head = `Couldn't plan ${weekdayName(slot.date)} ${slot.name.toLowerCase()}`
  const u = slot.unfilled
  if (!u || u.reason === 'no_attendance') return `${head}: nobody is attending.`
  if (u.slotRuleClaimed) return `${head}: nothing that matches its Slot Rule is available.`
  const e = u.eliminated
  if (e.considered === 0) return `${head}: there are no Recipes to choose from.`
  const parts: string[] = []
  if (e.exclusion > 0) parts.push('excluded')
  if (e.coolDown > 0) parts.push('in Cool-down')
  if (e.varietyRule > 0) parts.push('blocked by a Variety Rule')
  if (e.advanceStep > 0) parts.push('needs an Advance Step that is already too late')
  if (parts.length === 0) return `${head}: no Recipe fits.`
  return `${head}: every option was ${join(parts)}.`
}
