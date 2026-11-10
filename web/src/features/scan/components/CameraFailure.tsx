// Minimal, unstyled markup for B4 (the screen team restyles it on the new primitives, ui-fix-plan §5.6 and §4).
// Stub until implemented: renders nothing.
import type { CameraRecovery } from '../hooks/useCameraRecovery'

export interface CameraFailureProps {
  recovery: CameraRecovery
}

export function CameraFailure({ recovery }: CameraFailureProps) {
  void recovery
  return null
}
