import type { ReactNode } from 'react'
import { Menu, type MenuEntry } from '../../../ui'
import { slotMenu } from '../lib/courses'
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
}

/**
 * The slot block's menu: the shared Menu labelled "<Slot> actions", with "Mark all Cooked", "Not cooked: whole slot"
 * and "Add <Course>" per lib/courses slotMenu. Renders nothing when slotMenu is null (a one-Course slot).
 */
export function SlotMenu({ slot, today, onMarkAllCooked, onNotCookedSlot, onAddCourse }: SlotMenuProps): ReactNode {
  const model = slotMenu(slot, today)
  if (!model) return null
  const slotKey: SlotDayKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const items: MenuEntry[] = []
  if (model.markAllCooked) items.push({ id: 'mark-all-cooked', label: s.markAllCooked, onSelect: () => onMarkAllCooked(slotKey) })
  if (model.notCookedSlot) items.push({ id: 'not-cooked-slot', label: s.notCookedSlot, onSelect: () => onNotCookedSlot(slotKey) })
  for (const add of model.add) items.push({ id: `add-${add.key.courseId}`, label: add.label, onSelect: () => onAddCourse(add.key) })
  return <Menu label={s.slotActions(slot.name)} items={items} />
}
