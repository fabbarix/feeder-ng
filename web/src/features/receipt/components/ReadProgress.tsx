// The progress of a running read (design 3.3, mock-up 14): an indeterminate bar, the long-receipt line after 15 s, Cancel.
import { Button } from '../../../ui'
import { LONG_READ_AFTER_S } from '../lib/readPolling'
import { receiptStrings as t } from '../strings'

export interface ReadProgressProps {
  elapsedSeconds: number
  connectionLost: boolean
  onCancel: () => void
}

export function ReadProgress({ elapsedSeconds, connectionLost, onCancel }: ReadProgressProps) {
  return (
    <section className="receipt-progress">
      <div className="receipt-progress__status" role="status" aria-live="polite">
        <p className="receipt-progress__title">{t.reading}</p>
        <span className="receipt-progress__bar" aria-hidden="true" />
        {elapsedSeconds >= LONG_READ_AFTER_S ? <p className="receipt-progress__note">{t.longRead}</p> : null}
        {connectionLost ? <p className="receipt-progress__note">{t.lostConnection}</p> : null}
      </div>
      <Button variant="secondary" onClick={onCancel}>
        {t.cancel}
      </Button>
    </section>
  )
}
