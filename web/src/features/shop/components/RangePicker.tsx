export interface RangePickerProps {
  today: string
  /** the last date of the Planning Horizon */
  maxTo: string
  /** the range now in use */
  to: string
  onChange: (to: string) => void
}

/**
 * "Shop for" — a row of pill chips (`ui/Chip`) from lib/range rangeChoices(today, maxTo): "Today", "Tomorrow",
 * "Thu 12", ... The chip for `to` is selected (aria-pressed true); the others call onChange(choice.to). The group is
 * labelled "Shop for". Render and wire only. Stub until implemented.
 */
export function RangePicker(props: RangePickerProps) {
  void props
  return null
}
