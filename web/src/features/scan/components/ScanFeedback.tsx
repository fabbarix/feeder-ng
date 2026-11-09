import { Button } from '../../../ui/Button'
import { uiStrings } from '../../../ui/strings'
import { scanStrings } from '../strings'

export interface ScanFeedbackProps {
  /** feedbackText(...) of the scan, e.g. "Passata +700 g · $1.59" */
  text: string
  /** the scan sits in the offline queue, not yet on the server */
  queued?: boolean
  /** show the ✎ (edit price) button */
  canEditPrice: boolean
  onEditPrice: () => void
  onUndo: () => void
  onDismiss: () => void
}

/** The line shown after a scan: its text, the ✎ and Undo buttons and a dismiss control. Announced politely. */
export function ScanFeedback({ text, queued = false, canEditPrice, onEditPrice, onUndo, onDismiss }: ScanFeedbackProps) {
  return (
    <div role="status" aria-live="polite" className="scan-feedback">
      <p className="scan-feedback__text">{text}</p>
      {queued ? <span className="scan-feedback__queued">{scanStrings.waitingToSync}</span> : null}
      {canEditPrice ? (
        <Button variant="ghost" aria-label={scanStrings.editPrice} onClick={onEditPrice}>
          ✎
        </Button>
      ) : null}
      <Button variant="ghost" onClick={onUndo}>
        {scanStrings.undo}
      </Button>
      <Button variant="ghost" aria-label={uiStrings.dismiss} onClick={onDismiss}>
        ×
      </Button>
    </div>
  )
}
