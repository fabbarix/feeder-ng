// B9-39 (TB-10): the Today hero's ⋮ menu. The Planned Meal sheet's own actions lead (Swap, Pin or Unpin, Open Recipe), then the
// slot's items as SlotMenu has them (Mark all Cooked, Not cooked: whole slot, Add <Course>, and the per-date choices). Plain
// TypeScript, no React: the component maps each item to its handler.
import { planStrings as s } from '../strings'
import type { PlannedMeal, PlanSlot, SlotKey } from '../types'
import { slotMenu } from './courses'
import { choiceLabel } from './slotDate'

export type HeroMenuId = 'swap' | 'pin' | 'unpin' | 'open-recipe' | 'mark-all-cooked' | 'not-cooked-slot' | 'add' | 'whos-eating' | 'time' | 'not-served'

export interface HeroMenuItem {
  id: HeroMenuId
  label: string
  disabled?: boolean
  /** "Add <Course>": the key of the empty Course. */
  key?: SlotKey
}

/** The head of the menu: Swap, Pin (Unpin on a Pinned meal) and Open Recipe, in that order. */
export function heroMenuHead(meal: PlannedMeal): HeroMenuItem[] {
  return [
    { id: 'swap', label: s.swap },
    meal.pinned ? { id: 'unpin', label: s.unpin } : { id: 'pin', label: s.pin },
    { id: 'open-recipe', label: s.heroOpenRecipe },
  ]
}

/** What the screen wired: an item whose handler is missing is not offered. */
export interface HeroMenuOffer {
  swap: boolean
  pin: boolean
  unpin: boolean
  openRecipe: boolean
  /** The slot's own items (Mark all Cooked, Not cooked: whole slot, Add <Course>). */
  slotItems: boolean
  /** The per-date choices are wired; `offline` disables them. */
  dateChoices: boolean
  offline?: boolean
}

/** Every item of the hero's menu, in order; empty when nothing applies (the ⋮ is then not shown). */
export function heroMenuItems(slot: PlanSlot, today: string, meal: PlannedMeal, offer: HeroMenuOffer): HeroMenuItem[] {
  const wired: Record<'swap' | 'pin' | 'unpin' | 'open-recipe', boolean> = { swap: offer.swap, pin: offer.pin, unpin: offer.unpin, 'open-recipe': offer.openRecipe }
  const items = heroMenuHead(meal).filter((i) => wired[i.id as keyof typeof wired])
  const model = offer.slotItems || offer.dateChoices ? slotMenu(slot, today, offer.dateChoices) : null
  if (!model) return items
  const offline = offer.offline ?? false
  if (offer.slotItems) {
    if (model.markAllCooked) items.push({ id: 'mark-all-cooked', label: s.markAllCooked })
    if (model.notCookedSlot) items.push({ id: 'not-cooked-slot', label: s.notCookedSlot })
    for (const add of model.add) items.push({ id: 'add', label: add.label, key: add.key })
  }
  if (offer.dateChoices) {
    if (model.whosEating) items.push({ id: 'whos-eating', label: choiceLabel(s.slotDate.whosEating, offline), disabled: offline })
    if (model.time) items.push({ id: 'time', label: choiceLabel(model.time, offline), disabled: offline })
    if (model.notServed) items.push({ id: 'not-served', label: choiceLabel(s.slotDate.notServed, offline), disabled: offline })
  }
  return items
}
