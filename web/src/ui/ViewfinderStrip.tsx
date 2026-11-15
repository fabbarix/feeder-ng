import type { ReactNode } from 'react'
import { Icon } from './Icon'
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
  /** Accessible name of the region. Default "Scanner". The ImagePicker passes "Camera". */
  label?: string
  /** `strip` (default, 140 px, with the barcode reticle), `tall` (180 px, with the reticle; sets data-size="tall"), `photo` (4:3, no reticle, sets data-size="photo") or `bar` (SSP-06: the 56 px camera bar when there is no camera; `status` is its message). */
  size?: 'strip' | 'tall' | 'photo' | 'bar'
  /** B9-17 (SSP-06): extra controls in the strip's control row, before the torch and Mute (Scan's "Type a barcode" IconButton). Not shown on the bar. */
  controls?: ReactNode
  /** B9-17 (SSP-06): `size="bar"` only: the action at the end of the bar (Try again). */
  action?: ReactNode
  /**
   * `on` (default) shows the live camera. `paused` keeps the last frame and says "Camera paused" (a Picture or the Price entry is open).
   * `off` is no camera at all (a computer without one): no video, no reticle, no torch, the camera-off glyph.
   */
  camera?: 'on' | 'paused' | 'off'
}

/**
 * The compact camera strip above the live Shopping List (functional spec §10.1): a wide, short viewfinder with a
 * reticle, a torch button (when the camera has one) and a mute button. Layout only; it knows nothing about scanning.
 * `size="bar"` (SSP-06) is the camera bar for no camera or a refused one: a 56 px danger-tone bar with the reason (said once, as an
 * alert) and the caller's action (Try again) at its end; no picture, no torch, no Mute.
 */
export function ViewfinderStrip({ children, status, torch, mute, label, size = 'strip', camera = 'on', controls, action }: ViewfinderStripProps) {
  const name = label ?? uiStrings.scanner
  if (size === 'bar') {
    return (
      <section role="region" aria-label={name} className="viewfinder-strip" data-size="bar" data-camera="off">
        <span className="viewfinder-strip__off-icon">
          <Icon name="cameraOff" size={20} />
        </span>
        <p role="alert" className="viewfinder-strip__off-text">
          {status ?? uiStrings.noCamera}
        </p>
        {action}
      </section>
    )
  }
  const off = camera === 'off'
  const line = status ?? (off ? uiStrings.noCamera : camera === 'paused' ? uiStrings.cameraPaused : undefined)
  return (
    <section role="region" aria-label={name} className="viewfinder-strip" data-size={size === 'strip' ? undefined : size} data-camera={camera}>
      <div className="viewfinder-strip__picture">
        {off ? <Icon name="cameraOff" size={28} className="viewfinder-strip__glyph" /> : children}
        {size === 'photo' || off ? null : <span aria-hidden="true" className="viewfinder-strip__reticle" />}
        {line ? (
          <p aria-live="polite" className="viewfinder-strip__status">
            {line}
          </p>
        ) : null}
      </div>
      <div className="viewfinder-strip__controls">
        {controls}
        {torch?.supported && !off ? (
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
