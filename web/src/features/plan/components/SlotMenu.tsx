import type { ReactNode } from 'react'
import { Menu, type MenuEntry } from '../../../ui'
import { slotMenu } from '../lib/courses'
import { choiceLabel } from '../lib/slotDate'
import { planStrings as s } from '../strings'
import type { PlanSlot, SlotDateActions, SlotDayKey, SlotKey } from '../types'

export interface SlotMenuProps {
  slot: PlanSlot
  today: string
  /** The slot, `{ date, mealSlotId }`. */
  onMarkAllCooked: (slot: SlotDayKey) => void
  onNotCookedSlot: (slot: SlotDayKey) => void
  /** The key of the empty Course (courseId included). */
  onAddCourse: (key: SlotKey) => void
  /**
   * B5-F1: when given, the menu also holds Who's eating, Time today (Time on Thu) and Not served per lib/courses slotMenu, for
   * every slot; offline they are disabled and say "Needs a connection". Without it the menu is as before.
   */
  dateActions?: SlotDateActions
  /** DS-TODAY round 3: Not cooked is the first item (the hero after the slot time). Default: after Mark all Cooked. */
  notCookedFirst?: boolean
}

/**
 * The slot block's menu: the shared Menu labelled "<Slot> actions", with "Mark all Cooked", "Not cooked: whole slot",
 * "Add <Course>" per lib/courses slotMenu and, with `dateActions`, the per-date choices. Renders nothing when slotMenu is null.
 */
export function SlotMenu({ slot, today, onMarkAllCooked, onNotCookedSlot, onAddCourse, dateActions, notCookedFirst = false }: SlotMenuProps): ReactNode {
  const model = slotMenu(slot, today, dateActions !== undefined)
  if (!model) return null
  const slotKey: SlotDayKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const offline = dateActions?.offline ?? false
  const items: MenuEntry[] = []
  // DS-TODAY round 3: after the slot time the hero's own decision is Cooked and Adjust, so Not cooked leads this menu.
  const notCooked = model.notCookedSlot ? { id: 'not-cooked-slot', label: s.notCookedSlot, onSelect: () => onNotCookedSlot(slotKey) } : null
  if (notCookedFirst && notCooked) items.push(notCooked)
  if (model.markAllCooked) items.push({ id: 'mark-all-cooked', label: s.markAllCooked, onSelect: () => onMarkAllCooked(slotKey) })
  if (!notCookedFirst && notCooked) items.push(notCooked)
  for (const add of model.add) items.push({ id: `add-${add.key.courseId}`, label: add.label, onSelect: () => onAddCourse(add.key) })
  if (dateActions && model.whosEating) {
    items.push({ id: 'whos-eating', label: choiceLabel(s.slotDate.whosEating, offline), disabled: offline, onSelect: () => dateActions.onWhosEating(slotKey) })
  }
  if (dateActions && model.time) {
    items.push({ id: 'time', label: choiceLabel(model.time, offline), disabled: offline, onSelect: () => dateActions.onTime(slotKey) })
  }
  if (dateActions && model.notServed) {
    items.push({ id: 'not-served', label: choiceLabel(s.slotDate.notServed, offline), disabled: offline, onSelect: () => dateActions.onNotServed(slotKey) })
  }
  return <Menu label={s.slotActions(slot.name)} items={items} />
}
