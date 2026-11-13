// The review's totals (three metric tiles) and the notes it says in words (design 3.4, mock-up 15).
import { receiptStrings as t } from '../strings'

export interface ReviewSummaryProps {
  receiptCents?: number
  scannedCents: number
  lines: number
  money: (cents: number) => string
  notes: string[]
}

export function ReviewSummary({ receiptCents, scannedCents, lines, money, notes }: ReviewSummaryProps) {
  return (
    <>
      <div className="receipt-metrics" role="group" aria-label={t.receiptTotals}>
        <div className="receipt-metric">
          <span className="receipt-metric__label">{t.tileReceipt}</span>
          <span className="receipt-metric__value">{receiptCents !== undefined ? money(receiptCents) : '—'}</span>
        </div>
        <div className="receipt-metric">
          <span className="receipt-metric__label">{t.tileScanned}</span>
          <span className="receipt-metric__value">{money(scannedCents)}</span>
        </div>
        <div className="receipt-metric">
          <span className="receipt-metric__label">{t.tileLines}</span>
          <span className="receipt-metric__value">{lines}</span>
        </div>
      </div>
      {notes.map((note) => (
        <p key={note} className="receipt-note">
          {note}
        </p>
      ))}
    </>
  )
}
