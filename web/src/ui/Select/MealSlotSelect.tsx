import { useMemo } from 'react'
import { Select, type SelectFieldProps } from './Select'
import { mealSlotOptions, type MealSlotChoice } from './options'

export interface MealSlotSelectProps extends SelectFieldProps {
  slots: MealSlotChoice[]
  value: number | null
  onChange: (id: number) => void
  /** Localised weekday names, Monday first. Default English. */
  weekdayNames?: string[]
}

/** Meal Slots grouped by weekday, the time as meta, and each slot's icon. */
export function MealSlotSelect({ slots, value, onChange, weekdayNames, ...field }: MealSlotSelectProps) {
  const options = useMemo(() => mealSlotOptions(slots, weekdayNames), [slots, weekdayNames])
  return <Select<number> {...field} entityName="Meal Slot" options={options} value={value} onChange={onChange} />
}
