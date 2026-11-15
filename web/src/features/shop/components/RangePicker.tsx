import { useMemo } from 'react'
import { Select } from '../../../ui/Select/Select'
import { rangeOptions } from '../lib/range'
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
 * "Shop for": one Select of the days from today to the Planning Horizon; it shows the range in use ("Until Thu 12", or "Thu 12" when
 * the chip's own row has no room for it: B9-15, the chip Select's shortLabel). The list always shows the full labels.
 */
export function RangePicker({ today, maxTo, to, onChange }: RangePickerProps) {
  const options = useMemo(
    () => rangeOptions(today, maxTo).map((o) => ({ value: o.value, label: o.label, ...(o.short !== o.label ? { shortLabel: o.short } : {}) })),
    [today, maxTo],
  )
  return <Select<string> label={shopStrings.range} appearance="chip" icon="plan" options={options} value={to} onChange={onChange} />
}
