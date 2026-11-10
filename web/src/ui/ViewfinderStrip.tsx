import type { ReactNode } from 'react'
import { IconButton } from './IconButton'
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
  /** IP1 (declared, not yet implemented): accessible name of the region. Default "Scanner". The ImagePicker passes "Camera". */
  label?: string
  /** IP1 (declared, not yet implemented): `strip` (default, 140 px, with the barcode reticle) or `photo` (4:3, no reticle, sets data-size="photo"). */
  size?: 'strip' | 'photo'
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
          <IconButton icon="torch" label={torch.on ? uiStrings.torchOn : uiStrings.torchOff} pressed={torch.on} onClick={torch.onToggle} />
        ) : null}
        {mute ? (
          // One speaker glyph (the bundle budget): `pressed` shows the muted state, the name says what a press does.
          <IconButton icon="mute" label={mute.muted ? uiStrings.unmute : uiStrings.mute} pressed={mute.muted} onClick={mute.onToggle} />
        ) : null}
      </div>
    </section>
  )
}
