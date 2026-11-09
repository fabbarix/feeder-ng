import { useId } from 'react'
import { Chip } from '../../../ui'
import { PLANNER_ANCHORS, plannerStyleLabel, snapPlannerStyle } from '../lib/plannerStyle'
import { settingsStrings } from '../strings'
import '../settings.css'

export interface PlannerStyleSliderProps {
  /** 0..1; 0.5 = Variety. */
  value: number
  onChange: (next: number) => void
  disabled?: boolean
}

/** A slider named "Planner Style" with the three anchors as chips (Use what we have, Variety, Favourites). */
export function PlannerStyleSlider({ value, onChange, disabled }: PlannerStyleSliderProps) {
  const inputId = useId()
  return (
    <div className="settings__stack">
      <label className="field__label" htmlFor={inputId}>
        {settingsStrings.plannerStyle}
      </label>
      <input
        id={inputId}
        className="slider"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        aria-valuetext={plannerStyleLabel(value)}
        onChange={(e) => onChange(snapPlannerStyle(Number(e.target.value)))}
      />
      <div className="slider-anchors">
        {PLANNER_ANCHORS.map((a) => (
          <Chip key={a.position} selected={value === a.position} disabled={disabled} onClick={() => onChange(a.position)}>
            {a.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
