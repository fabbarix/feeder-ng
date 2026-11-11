import { Button } from '../../../ui/Button'
import { IconButton } from '../../../ui/IconButton'
import { uiStrings } from '../../../ui/strings'
import { PictureThumb } from '../../products/components/PictureThumb'
import { scanStrings } from '../strings'

export interface ScanFeedbackProps {
  /** feedbackText(...) of the scan, e.g. "Passata +700 g · $1.59" */
  text: string
  /** PP: the Product's Picture, drawn as a small leading thumb; nothing is drawn (and no space kept) without it */
  imageUrl?: string
  /** the scan sits in the offline queue, not yet on the server */
  queued?: boolean
  /** offers the Edit price IconButton */
  canEditPrice: boolean
  onEditPrice: () => void
  onUndo: () => void
  onDismiss: () => void
}

/** The line shown after a scan: its text, the Edit price and Undo actions and a dismiss control. Announced politely. */
export function ScanFeedback({ text, imageUrl, queued = false, canEditPrice, onEditPrice, onUndo, onDismiss }: ScanFeedbackProps) {
  return (
    <div role="status" aria-live="polite" className="scan-feedback" data-has-picture={imageUrl ? '' : undefined}>
      {imageUrl ? <PictureThumb imageUrl={imageUrl} size={40} /> : null}
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
