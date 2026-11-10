// What to offer when the camera does not work (B4). Pure TypeScript.
import { scanStrings } from '../strings'
import type { CameraStatus } from '../hooks/useCamera'

export interface CameraFailure {
  status: Extract<CameraStatus, 'denied' | 'unsupported' | 'no_camera' | 'in_use' | 'error'>
  /** a retry can help; false when the browser cannot open any camera (`unsupported`) */
  canRetry: boolean
  /** the message to show */
  message: string
}

const messages: Record<CameraFailure['status'], string> = {
  denied: scanStrings.cameraDenied,
  unsupported: scanStrings.cameraUnsupported,
  no_camera: scanStrings.cameraNoCamera,
  in_use: scanStrings.cameraInUse,
  error: scanStrings.cameraError,
}

export function cameraFailure(status: CameraStatus): CameraFailure | null {
  if (status === 'idle' || status === 'starting' || status === 'ready') return null
  return { status, canRetry: status !== 'unsupported', message: messages[status] }
}
