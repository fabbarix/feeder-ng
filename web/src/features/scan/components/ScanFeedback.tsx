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

/**
 * The line shown after a scan (functional spec §10.1 step 4): the text, a "✎" button named "Edit price" (only when
 * canEditPrice), an "Undo" button, and a dismiss control. role="status" so it is announced. When queued it adds
 * the words "Waiting to sync". Render and wire only. Stub until implemented.
 */
export function ScanFeedback(props: ScanFeedbackProps) {
  void props
  return null
}
