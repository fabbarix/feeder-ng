// SSP-06, SSP-12: whether the typed entry (ManualBarcodeEntry) is open, and where focus goes.
// - Camera works: closed until Type a barcode opens it (recovery.manualOpen is the state). Opening focuses the Barcode field;
//   closing (the toggle again, or Back to the camera) returns focus to the toggle.
// - No camera: open from the start, never focused on mount, so a phone keyboard does not pop up unasked.
// - Blocked (the Price keypad is open): closed, and the toggle is disabled. An entry that was open beside a working camera is
//   closed through the recovery, so it stays closed after the keypad; with no camera it is back, unfocused, when the keypad closes.
import { useEffect, useId, useRef, type RefObject } from 'react'
import type { CameraRecovery } from './useCameraRecovery'

export interface UseTypedEntryOptions {
  recovery: CameraRecovery
  /** the camera has not failed (the strip shows, with Type a barcode) */
  cameraWorks: boolean
  /** the Price keypad is open */
  blocked: boolean
}

export interface TypedEntry {
  open: boolean
  /** Type a barcode, and Back to the camera */
  toggle: () => void
  toggleDisabled: boolean
  /** the <form data-typed-entry> */
  entryRef: RefObject<HTMLFormElement | null>
  /** the Type a barcode button */
  toggleRef: RefObject<HTMLButtonElement | null>
  /** the form's id (aria-controls) */
  id: string
}

export function useTypedEntry({ recovery, cameraWorks, blocked }: UseTypedEntryOptions): TypedEntry {
  const id = `typed-entry${useId().replace(/:/g, '')}`
  const entryRef = useRef<HTMLFormElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const recoveryRef = useRef(recovery)
  recoveryRef.current = recovery
  // where focus goes once the toggle's open or close has rendered
  const pendingFocus = useRef<'field' | 'toggle' | null>(null)

  const open = !blocked && (cameraWorks ? recovery.manualOpen : true)

  // The keypad opened over an entry typed beside a working camera: the entry closes for good (it does not reopen by itself).
  useEffect(() => {
    if (blocked && cameraWorks && recoveryRef.current.manualOpen) recoveryRef.current.closeManual()
    // only when the keypad opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked])

  useEffect(() => {
    const target = pendingFocus.current
    if (target === 'field' && open) {
      pendingFocus.current = null
      entryRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    } else if (target === 'toggle' && !open) {
      pendingFocus.current = null
      toggleRef.current?.focus()
    }
  }, [open])

  const toggle = () => {
    if (blocked) return
    const r = recoveryRef.current
    if (r.manualOpen) {
      pendingFocus.current = 'toggle'
      r.closeManual()
    } else {
      pendingFocus.current = 'field'
      r.openManual()
    }
  }

  return { open, toggle, toggleDisabled: blocked, entryRef, toggleRef, id }
}
