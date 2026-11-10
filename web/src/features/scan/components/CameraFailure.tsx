// What the Scan screen offers when the camera does not work (B4): the reason, "try the camera again" (when a retry
// can help) and typing the barcode.
import { Button } from '../../../ui/Button'
import { ErrorState } from '../../../ui/ErrorState'
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
      <ErrorState message={failure.message} onRetry={failure.canRetry ? () => recovery.retry() : undefined} retryLabel={scanStrings.retryCamera} />
      {recovery.manualOpen ? (
        <ManualBarcodeEntry recovery={recovery} />
      ) : (
        <Button variant="secondary" icon="scan" onClick={() => recovery.openManual()}>
          {scanStrings.enterBarcode}
        </Button>
      )}
    </div>
  )
}
