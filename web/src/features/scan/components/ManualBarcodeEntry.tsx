// SSP-06: the typed entry, one row: the Barcode field and Use (primary, arrow; named "Use this barcode"). Under the camera bar
// when there is no camera, under the strip when Type a barcode opened it. After Use the recovery clears the text (when the code
// is good) and focus goes back to the field, so several codes can be typed. "Back to the camera" only while a camera exists
// (`onBack`). Renders and wires events only.
import type { Ref } from 'react'
import { Button } from '../../../ui/Button'
import { TextField } from '../../../ui/fields/TextField'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { scanStrings } from '../strings'

export interface ManualBarcodeEntryProps {
  recovery: CameraRecovery
  /** the form's id (Type a barcode's aria-controls) */
  id?: string
  /** "Back to the camera": given only while a camera exists */
  onBack?: () => void
  /** the form (useTypedEntry's entryRef) */
  ref?: Ref<HTMLFormElement>
}

export function ManualBarcodeEntry({ recovery, id, onBack, ref }: ManualBarcodeEntryProps) {
  return (
    <form
      ref={ref}
      id={id}
      className="scan-sheet-form typed-entry"
      data-typed-entry=""
      onSubmit={(event) => {
        event.preventDefault()
        recovery.submit()
        event.currentTarget.querySelector('input')?.focus()
      }}
    >
      <TextField
        size="full"
        label={scanStrings.manualBarcodeLabel}
        helper={scanStrings.manualBarcodeHint}
        error={recovery.error ? scanStrings.manualBarcodeError[recovery.error] : undefined}
        inputMode="numeric"
        data-size-intent="long"
        autoComplete="off"
        value={recovery.text}
        onChange={(text) => recovery.setText(text)}
      />
      <Button type="submit" icon="next" className="typed-entry__use" aria-label={scanStrings.useBarcode} data-one-line>
        {scanStrings.use}
      </Button>
      {onBack ? (
        <Button variant="secondary" className="typed-entry__back" data-one-line onClick={onBack}>
          {scanStrings.closeManual}
        </Button>
      ) : null}
    </form>
  )
}
