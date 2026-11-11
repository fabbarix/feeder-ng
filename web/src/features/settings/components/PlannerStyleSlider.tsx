import { Slider } from '../../../ui'
import { PLANNER_ANCHORS, plannerStyleLabel, snapPlannerStyle } from '../lib/plannerStyle'
import { settingsStrings } from '../strings'
import '../settings.css'

export interface PlannerStyleSliderProps {
  /** 0..1; 0.5 = Variety. */
  value: number
  onChange: (next: number) => void
  disabled?: boolean
}

/** The shared Slider "Planner Style" (quarter steps, value text = the anchor or "Between X and Y"). */
export function PlannerStyleSlider({ value, onChange, disabled }: PlannerStyleSliderProps) {
  return (
    <Slider
      label={settingsStrings.plannerStyle}
      min={0}
      max={1}
      step={0.25}
      value={value}
      disabled={disabled}
      stops={PLANNER_ANCHORS.map((a) => ({ value: a.position, label: a.label }))}
      valueText={plannerStyleLabel}
      onChange={(next) => onChange(snapPlannerStyle(next))}
    />
  )
}
