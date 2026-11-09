import type { Preferences } from '../types'

export interface PreferencesFormProps {
  value: Preferences
  saving?: boolean
  onSave: (next: Preferences) => void | Promise<void>
}

/** Radio groups "Colour mode" (Light, Dark, System) and "Units" (Metric, Imperial); accent presets as chips plus
 *  "Custom accent colour"; checkbox "Use a secondary colour" with "Secondary colour"; "Save preferences"
 *  (disabled until something changes). */
export function PreferencesForm(_props: PreferencesFormProps) {
  return null
}
