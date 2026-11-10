// B4 state machine: when the camera fails, offer "try again" and manual barcode entry. Typed barcodes go through
// validateManualBarcode and then to onScan exactly like a camera read. Stub until implemented.
import type { Scanned } from '../lib/barcode'
import type { CameraFailure } from '../lib/cameraFailure'
import type { ManualBarcodeError } from '../lib/manualBarcode'
import type { CameraStatus } from './useCamera'

export interface UseCameraRecoveryOptions {
  status: CameraStatus
  /** useCamera().retry */
  retryCamera: () => void
  /** the flow's onScan */
  onScan: (scanned: Scanned) => void
}

export interface CameraRecovery {
  /** non-null while the camera is in a failed state */
  failure: CameraFailure | null
  /** the manual entry is open */
  manualOpen: boolean
  openManual(): void
  closeManual(): void
  text: string
  setText(text: string): void
  /** why the last submit was refused; cleared by setText, closeManual and retry */
  error: ManualBarcodeError | null
  /** validates the text; on success calls onScan once, clears text and error, returns true */
  submit(): boolean
  /** clears the error and calls retryCamera (only while failure?.canRetry) */
  retry(): void
}

export function useCameraRecovery(options: UseCameraRecoveryOptions): CameraRecovery {
  void options
  return { failure: null, manualOpen: false, openManual() {}, closeManual() {}, text: '', setText() {}, error: null, submit: () => false, retry() {} }
}
