import { useEffect, useState } from 'react'
import { quickStartRows, quickStartSlots, withNewRow, type QuickStartRow, type QuickStartSlot } from '../lib/quickStart'

export interface MealSlotQuickStart {
  rows: QuickStartRow[]
  /** The row whose time field is open, if any. */
  editingTime: string | null
  toggle: (key: string) => void
  setName: (key: string, name: string) => void
  setTime: (key: string, time: string) => void
  toggleTime: (key: string) => void
  /** Adds a ticked, unnamed row; returns its key (its Name field takes focus). */
  addRow: () => string
  slots: QuickStartSlot[]
}

/** B9-53 (TB-06, step 3): the rows of "When do you eat?", fresh each time the sheet opens. */
export function useMealSlotQuickStart(open: boolean): MealSlotQuickStart {
  const [rows, setRows] = useState<QuickStartRow[]>(quickStartRows)
  const [editingTime, setEditingTime] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setRows(quickStartRows())
      setEditingTime(null)
    }
  }, [open])
  const patch = (key: string, change: Partial<QuickStartRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)))
  return {
    rows,
    editingTime,
    toggle: (key) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, on: !r.on } : r))),
    setName: (key, name) => patch(key, { name }),
    setTime: (key, time) => patch(key, { time }),
    toggleTime: (key) => setEditingTime((k) => (k === key ? null : key)),
    addRow: () => {
      const next = withNewRow(rows)
      setRows(next)
      return next[next.length - 1]!.key
    },
    slots: quickStartSlots(rows),
  }
}
