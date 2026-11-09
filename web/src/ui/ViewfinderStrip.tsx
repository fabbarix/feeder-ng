import type { ReactNode } from 'react'
import { Button } from './Button'
import { uiStrings } from './strings'
import './ViewfinderStrip.css'

export interface ViewfinderStripProps {
  /** the live camera (a <video>) */
  children?: ReactNode
  /** a line over the picture, e.g. "Starting the camera" or the camera error */
  status?: string
  /** shown only when `supported` */
  torch?: { supported: boolean; on: boolean; onToggle: () => void }
  mute?: { muted: boolean; onToggle: () => void }
}

/**
 * The compact camera strip above the live Shopping List (functional spec §10.1): a wide, short viewfinder with a
 * reticle, a torch button (when the camera has one) and a mute button. Layout only; it knows nothing about scanning.
 */
export function ViewfinderStrip({ children, status, torch, mute }: ViewfinderStripProps) {
  return (
    <section role="region" aria-label={uiStrings.scanner} className="viewfinder-strip">
      <div className="viewfinder-strip__picture">
        {children}
        <span aria-hidden="true" className="viewfinder-strip__reticle" />
        {status ? <p className="viewfinder-strip__status">{status}</p> : null}
      </div>
      <div className="viewfinder-strip__controls">
        {torch?.supported ? (
          <Button
            variant="tonal"
            aria-pressed={torch.on}
            aria-label={torch.on ? uiStrings.torchOn : uiStrings.torchOff}
            onClick={torch.onToggle}
          >
            {torch.on ? uiStrings.torchOn : uiStrings.torchOff}
          </Button>
        ) : null}
        {mute ? (
          <Button
            variant="ghost"
            aria-pressed={mute.muted}
            aria-label={mute.muted ? uiStrings.unmute : uiStrings.mute}
            onClick={mute.onToggle}
          >
            {mute.muted ? uiStrings.unmute : uiStrings.mute}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
