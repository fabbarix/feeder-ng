import type { ReactNode } from 'react'

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
 * Stub until implemented: landmark role="region" aria-label "Scanner"; torch button aria-pressed, named "Torch on" /
 * "Torch off" by its state; mute button aria-pressed (pressed = muted), named "Mute beep" / "Unmute beep".
 */
export function ViewfinderStrip(props: ViewfinderStripProps) {
  void props
  return null
}
