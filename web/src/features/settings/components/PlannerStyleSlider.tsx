export interface PlannerStyleSliderProps {
  /** 0..1; 0.5 = Variety. */
  value: number
  onChange: (next: number) => void
  disabled?: boolean
}

/** A slider named "Planner Style" with the three anchors as chips (Use what we have, Variety, Favourites). */
export function PlannerStyleSlider(_props: PlannerStyleSliderProps) {
  return null
}
