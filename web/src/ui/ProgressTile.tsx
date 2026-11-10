import { Tile } from './Tile'
import './ProgressTile.css'

export interface ProgressTileProps {
  label: string
  value: number
  max: number
  /** Shown instead of "value / max". */
  valueLabel?: string
}

/** A soft Tile showing progress through a known total, as an accessible progressbar. */
export function ProgressTile({ label, value, max, valueLabel }: ProgressTileProps) {
  const clamped = Math.min(Math.max(value, 0), Math.max(max, 0))
  const percent = max > 0 ? (clamped / max) * 100 : 0
  return (
    <Tile variant="soft" className="progress-tile">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
        className="progress-tile__bar"
      >
        <span className="progress-tile__fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="progress-tile__label">{label}</p>
      <span className="progress-tile__value">{valueLabel ?? `${clamped} / ${max}`}</span>
    </Tile>
  )
}
