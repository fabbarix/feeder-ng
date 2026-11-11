import { Button } from '../../Button'
import { ViewfinderStrip } from '../../ViewfinderStrip'
import type { UseCameraCapture } from '../hooks/useCameraCapture'
import { imagePickerStrings as t } from '../strings'

export interface CameraPanelProps {
  camera: UseCameraCapture
  disabled?: boolean
  onCapture: () => void
  onClose: () => void
}

/** The shared viewfinder at photo size, with Capture, Switch camera (only with more than one camera) and Close camera. */
export function CameraPanel({ camera, disabled, onCapture, onClose }: CameraPanelProps) {
  const ready = camera.status === 'ready'
  return (
    <div className="image-picker__panel">
      <ViewfinderStrip label={t.cameraRegion} size="photo" status={camera.status === 'starting' ? t.cameraStarting : undefined} torch={camera.torch}>
        <video ref={camera.videoRef} playsInline muted aria-hidden="true" />
      </ViewfinderStrip>
      <div className="image-picker__panel-actions">
        <Button variant="secondary" icon="camera" disabled={disabled || !ready} onClick={onCapture}>
          {t.capture}
        </Button>
        {camera.canSwitch ? (
          <Button variant="tertiary" disabled={disabled} onClick={camera.switchCamera}>
            {t.switchCamera}
          </Button>
        ) : null}
        <Button variant="tertiary" icon="close" disabled={disabled} onClick={onClose}>
          {t.closeCamera}
        </Button>
      </div>
    </div>
  )
}
