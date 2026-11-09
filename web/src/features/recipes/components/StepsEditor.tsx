import type { ReactNode } from 'react'
import type { DraftErrors, StepDraft } from '../lib/draft'

export interface StepsEditorProps {
  steps: StepDraft[]
  errors: DraftErrors
  onChange: (steps: StepDraft[]) => void
}

/**
 * The Steps editor: one row per Step (text, kind select Active / Passive / Advance Step, "Duration
 * (min)" for Active and Passive or "Lead time (min)" for an Advance Step, "After" checkboxes from
 * lib/steps.afterOptions, remove, move up/down) and an "Add Step" button. All reordering and
 * dependency remapping goes through lib/steps; the component only renders and calls onChange.
 */
export function StepsEditor(_props: StepsEditorProps): ReactNode {
  throw new Error('TODO')
}
