// B4 state machine: when the camera fails, offer "try again" and manual barcode entry. Typed barcodes go through
// validateManualBarcode and then to onScan exactly like a camera read. React hook; the camera and the flow are injected.
import { useState } from 'react'
import type { Scanned } from '../lib/barcode'
import { cameraFailure, type CameraFailure } from '../lib/cameraFailure'
import { validateManualBarcode, type ManualBarcodeError } from '../lib/manualBarcode'
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
  const { status, retryCamera, onScan } = options
  const failure = cameraFailure(status)
  const [manualOpen, setManualOpen] = useState(false)
  const [text, setTextValue] = useState('')
  const [error, setError] = useState<ManualBarcodeError | null>(null)

  const setText = (value: string) => {
    setTextValue(value)
    setError(null)
  }

  const closeManual = () => {
    setManualOpen(false)
    setTextValue('')
    setError(null)
  }

  const submit = (): boolean => {
    const result = validateManualBarcode(text)
    if (!result.ok) {
      setError(result.reason)
      return false
    }
    onScan(result.scanned)
    setTextValue('')
    setError(null)
    return true
  }

  const retry = () => {
    setError(null)
    if (failure?.canRetry) retryCamera()
  }

  return { failure, manualOpen, openManual: () => setManualOpen(true), closeManual, text, setText, error, submit, retry }
}
