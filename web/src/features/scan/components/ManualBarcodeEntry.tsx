// The typed-barcode form offered when the camera does not work (B4). Renders and wires events only.
import { Button } from '../../../ui/Button'
import { FormActions } from '../../../ui/FormActions'
import { TextField } from '../../../ui/fields/TextField'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { scanStrings } from '../strings'

export interface ManualBarcodeEntryProps {
  recovery: CameraRecovery
}

export function ManualBarcodeEntry({ recovery }: ManualBarcodeEntryProps) {
  return (
    <form
      className="scan-sheet-form"
      onSubmit={(event) => {
        event.preventDefault()
        recovery.submit()
      }}
    >
      <TextField
        label={scanStrings.manualBarcodeLabel}
        helper={scanStrings.manualBarcodeHint}
        error={recovery.error ? scanStrings.manualBarcodeError[recovery.error] : undefined}
        inputMode="numeric"
        autoComplete="off"
        value={recovery.text}
        onChange={(text) => recovery.setText(text)}
      />
      <FormActions
        primary={<Button type="submit">{scanStrings.useBarcode}</Button>}
        tertiary={
          <Button variant="tertiary" onClick={() => recovery.closeManual()}>
            {scanStrings.closeManual}
          </Button>
        }
      />
    </form>
  )
}
