// The camera hook moved to ui/lib/useCamera (the ImagePicker shares it); this module keeps the scan imports working.
export { statusForCameraError, useCamera } from '../../../ui/lib/useCamera'
export type { CameraStatus, MediaDevicesLike, UseCameraOptions, UseCameraResult } from '../../../ui/lib/useCamera'
