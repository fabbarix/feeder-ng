// What to offer when the camera does not work (B4). Pure TypeScript. Stub until implemented.
import type { CameraStatus } from '../hooks/useCamera'

export interface CameraFailure {
  status: Extract<CameraStatus, 'denied' | 'unsupported' | 'no_camera' | 'in_use' | 'error'>
  /** a retry can help; false when the browser cannot open any camera (`unsupported`) */
  canRetry: boolean
  /** the message to show */
  message: string
}

export function cameraFailure(status: CameraStatus): CameraFailure | null {
  void status
  return null
}
