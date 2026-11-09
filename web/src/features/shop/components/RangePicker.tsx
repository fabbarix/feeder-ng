import { Chip } from '../../../ui/Chip'
import { rangeChoices } from '../lib/range'
import { shopStrings } from '../strings'

export interface RangePickerProps {
  today: string
  /** the last date of the Planning Horizon */
  maxTo: string
  /** the range now in use */
  to: string
  onChange: (to: string) => void
}

/** "Shop for": one pill per day from today to the Planning Horizon; the range in use is pressed. */
export function RangePicker({ today, maxTo, to, onChange }: RangePickerProps) {
  return (
    <div role="group" aria-label={shopStrings.range} className="range-picker">
      {rangeChoices(today, maxTo).map((choice) => (
        <Chip key={choice.to} selected={choice.to === to} onClick={() => onChange(choice.to)}>
          {choice.label}
        </Chip>
      ))}
    </div>
  )
}
