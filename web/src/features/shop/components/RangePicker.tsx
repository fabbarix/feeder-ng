import { useMemo } from 'react'
import { Select } from '../../../ui/Select/Select'
import { rangeOptions } from '../lib/range'
import { useNarrowChips } from '../hooks/useNarrowChips'
import { shopStrings } from '../strings'

export interface RangePickerProps {
  today: string
  /** the last date of the Planning Horizon */
  maxTo: string
  /** the range now in use */
  to: string
  onChange: (to: string) => void
}

/**
 * "Shop for": one Select of the days from today to the Planning Horizon; it shows the range in use ("Until Thu 12", or "Thu 12" below
 * 420 px, b8-shop). The list always shows the full labels.
 */
export function RangePicker({ today, maxTo, to, onChange }: RangePickerProps) {
  const narrow = useNarrowChips()
  const options = useMemo(
    () => rangeOptions(today, maxTo).map((o) => ({ value: o.value, label: o.label, ...(narrow ? { triggerLabel: o.short } : {}) })),
    [today, maxTo, narrow],
  )
  return <Select<string> label={shopStrings.range} appearance="chip" icon="plan" options={options} value={to} onChange={onChange} />
}
