// What to offer when the camera does not work (B4). Pure TypeScript.
import { scanStrings } from '../strings'
import type { CameraStatus } from '../hooks/useCamera'

export interface CameraFailure {
  status: Extract<CameraStatus, 'denied' | 'unsupported' | 'no_camera' | 'in_use' | 'error'>
  /** a retry can help; false when the browser cannot open any camera (`unsupported`) */
  canRetry: boolean
  /** the camera bar's message (one short line) */
  message: string
}

// SSP-06: the camera bar's message, one short line at 375 px. A browser that cannot open a camera reads as no camera.
const messages: Record<CameraFailure['status'], string> = {
  denied: scanStrings.cameraBarDenied,
  unsupported: scanStrings.noCameraBar,
  no_camera: scanStrings.noCameraBar,
  in_use: scanStrings.cameraBarInUse,
  error: scanStrings.cameraBarError,
}

export function cameraFailure(status: CameraStatus): CameraFailure | null {
  if (status === 'idle' || status === 'starting' || status === 'ready') return null
  return { status, canRetry: status !== 'unsupported', message: messages[status] }
}
