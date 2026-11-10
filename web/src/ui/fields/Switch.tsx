import { useId } from 'react'
import './Switch.css'

export interface SwitchProps {
  label: string
  /** F-02 (A1) stub: overrides the accessible name while `label` stays the visible text ("Admin" visible, "Admin: cook@x" announced). Developer implements. */
  'aria-label'?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

/** An on/off setting: a role=switch button (52 x 32) named by its label. */
export function Switch({ label, checked, disabled, onChange }: SwitchProps) {
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
        aria-labelledby={labelId}
        disabled={disabled}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" aria-hidden="true" />
      </button>
    </div>
  )
}
