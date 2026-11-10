// What the Scan screen offers when the camera does not work (B4): the reason, "try the camera again" (when a retry
// can help) and typing the barcode. Built from the shared Button; the screen team restyles it (ui-fix-plan §5.6, §4).
import { Button } from '../../../ui/Button'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { scanStrings } from '../strings'
import { ManualBarcodeEntry } from './ManualBarcodeEntry'

export interface CameraFailureProps {
  recovery: CameraRecovery
}

export function CameraFailure({ recovery }: CameraFailureProps) {
  const { failure } = recovery
  if (!failure) return null
  return (
    <div className="camera-failure">
      <p className="camera-failure__message">{failure.message}</p>
      {recovery.manualOpen ? (
        <ManualBarcodeEntry recovery={recovery} />
      ) : (
        <div className="camera-failure__actions">
          {failure.canRetry ? (
            <Button variant="tonal" onClick={() => recovery.retry()}>
              {scanStrings.retryCamera}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => recovery.openManual()}>
            {scanStrings.enterBarcode}
          </Button>
        </div>
      )}
    </div>
  )
}
