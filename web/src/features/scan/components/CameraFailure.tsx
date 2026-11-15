// SSP-06: the camera bar, shown where the viewfinder was when the camera does not work (B4): the 56 px ViewfinderStrip
// size="bar" with the reason (said once, as its alert) and Try again at its end when a retry can help. The typed entry is not
// in it: the screen puts ManualBarcodeEntry under the bar. Renders and wires events only.
import { Button } from '../../../ui/Button'
import { ViewfinderStrip } from '../../../ui/ViewfinderStrip'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { scanStrings } from '../strings'

export interface CameraFailureProps {
  recovery: CameraRecovery
}

export function CameraFailure({ recovery }: CameraFailureProps) {
  const { failure } = recovery
  if (!failure) return null
  return (
    <ViewfinderStrip
      size="bar"
      status={failure.message}
      action={
        failure.canRetry ? (
          <Button variant="secondary" size="sm" data-one-line onClick={() => recovery.retry()}>
            {scanStrings.tryAgain}
          </Button>
        ) : undefined
      }
    />
  )
}
