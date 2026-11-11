import type { WeekStart } from './weekdays'

export interface WeekdayPickerProps {
  /** The visible group label ("Apply to", "Days"); also the group's accessible name. */
  label: string
  /** Selected ISO weekdays (1 Monday .. 7 Sunday). */
  value: number[]
  /** Always ascending ISO order, whatever the week start. */
  onChange: (days: number[]) => void
  /** First weekday shown (default Monday, 1). */
  weekStart?: WeekStart
  /** BCP 47 locale for the short and full names (default 'en'). */
  locale?: string
  disabled?: boolean
  helper?: string
  /** A problem with the choice: shown as role="alert" and linked with aria-describedby. */
  error?: string
}

/** STUB (R15 step 2): seven toggle chips; see docs/dev/design/r15-meal-slots.md section 3. */
export function WeekdayPicker(_props: WeekdayPickerProps) {
  return null
}
