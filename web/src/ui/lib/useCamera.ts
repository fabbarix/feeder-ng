// IP1 stub. The Developer MOVES useCamera, statusForCameraError and their types from features/scan/hooks/useCamera.ts to here
// (the scan hook then re-exports this module so the scan tests and imports keep working) and adds the `facingMode` option.
import { useCamera as scanUseCamera, type UseCameraOptions as ScanOptions, type UseCameraResult } from '../../features/scan/hooks/useCamera'

export type { CameraStatus, MediaDevicesLike, UseCameraResult } from '../../features/scan/hooks/useCamera'
export { statusForCameraError } from '../../features/scan/hooks/useCamera'

export interface UseCameraOptions extends ScanOptions {
  /** Default 'environment' (rear camera); the picker's "Switch camera" passes 'user'. Changing it reopens the camera. */
  facingMode?: 'environment' | 'user'
}

export function useCamera(options: UseCameraOptions): UseCameraResult {
  return scanUseCamera(options)
}
