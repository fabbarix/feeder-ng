// The typed-barcode form offered when the camera does not work (B4). Renders and wires events only.
import { Button } from '../../../ui/Button'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { scanStrings } from '../strings'

export interface ManualBarcodeEntryProps {
  recovery: CameraRecovery
}

export function ManualBarcodeEntry({ recovery }: ManualBarcodeEntryProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        recovery.submit()
      }}
    >
      <div className="field">
        <label className="field__label" htmlFor="manual-barcode">
          {scanStrings.manualBarcodeLabel}
        </label>
        <input
          id="manual-barcode"
          className="field__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby="manual-barcode-hint"
          value={recovery.text}
          onChange={(event) => recovery.setText(event.target.value)}
        />
        <p id="manual-barcode-hint" className="field__hint">
          {scanStrings.manualBarcodeHint}
        </p>
        {recovery.error ? (
          <p className="field__error" role="alert">
            {scanStrings.manualBarcodeError[recovery.error]}
          </p>
        ) : null}
      </div>
      <Button type="submit">{scanStrings.useBarcode}</Button>
      <Button variant="ghost" onClick={() => recovery.closeManual()}>
        {scanStrings.closeManual}
      </Button>
    </form>
  )
}
