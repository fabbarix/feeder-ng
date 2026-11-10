import { Button } from '../../../ui/Button'
import { IconButton } from '../../../ui/IconButton'
import { uiStrings } from '../../../ui/strings'
import { scanStrings } from '../strings'

export interface ScanFeedbackProps {
  /** feedbackText(...) of the scan, e.g. "Passata +700 g · $1.59" */
  text: string
  /** the scan sits in the offline queue, not yet on the server */
  queued?: boolean
  /** offers the Edit price IconButton */
  canEditPrice: boolean
  onEditPrice: () => void
  onUndo: () => void
  onDismiss: () => void
}

/** The line shown after a scan: its text, the Edit price and Undo actions and a dismiss control. Announced politely. */
export function ScanFeedback({ text, queued = false, canEditPrice, onEditPrice, onUndo, onDismiss }: ScanFeedbackProps) {
  return (
    <div role="status" aria-live="polite" className="scan-feedback">
      <p className="scan-feedback__text">{text}</p>
      {queued ? <span className="scan-feedback__queued">{scanStrings.waitingToSync}</span> : null}
      <div className="scan-feedback__actions">
        {canEditPrice ? <IconButton icon="edit" label={scanStrings.editPrice} onClick={onEditPrice} /> : null}
        <Button variant="tertiary" onClick={onUndo}>
          {scanStrings.undo}
        </Button>
        <IconButton icon="close" label={uiStrings.dismiss} onClick={onDismiss} />
      </div>
    </div>
  )
}
