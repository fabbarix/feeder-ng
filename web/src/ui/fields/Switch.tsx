import { useId } from 'react'
import './Switch.css'

export interface SwitchProps {
  label: string
  /** Overrides the accessible name while `label` stays the visible text ("Admin" visible, "Admin: cook@x" announced). */
  'aria-label'?: string
  /** CRS E2: a helper line under the label, linked with aria-describedby so it is read with the switch. */
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

/** An on/off setting: a role=switch button (52 x 32) named by its label. */
export function Switch({ label, 'aria-label': ariaLabel, checked, disabled, onChange }: SwitchProps) {
  const labelId = useId()
  return (
    <div className="switch-row">
      <span id={labelId} className="switch-row__label">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={ariaLabel ? undefined : labelId}
        aria-label={ariaLabel}
        disabled={disabled}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" aria-hidden="true" />
      </button>
    </div>
  )
}
