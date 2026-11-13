// The review's totals (three metric tiles) and the notes it says in words, in one info tile (design 3.4, mock-ups 15 and 16).
import { Tile } from '../../../ui'
import { receiptStrings as t } from '../strings'

export interface ReviewSummaryProps {
  receiptCents?: number
  scannedCents: number
  lines: number
  money: (cents: number) => string
  notes: string[]
}

export function ReviewSummary({ receiptCents, scannedCents, lines, money, notes }: ReviewSummaryProps) {
  const metrics: [string, string][] = [
    [t.tileReceipt, receiptCents !== undefined ? money(receiptCents) : '—'],
    [t.tileScanned, money(scannedCents)],
    [t.tileLines, String(lines)],
  ]
  return (
    <>
      <div className="receipt-metrics" role="group" aria-label={t.receiptTotals}>
        {metrics.map(([label, value]) => (
          <Tile key={label} overline={label}>
            <span className="receipt-metric__value">{value}</span>
          </Tile>
        ))}
      </div>
      {notes.length > 0 ? (
        <Tile variant="status" status="info">
          {notes.map((note) => (
            <p key={note} className="receipt-note">
              {note}
            </p>
          ))}
        </Tile>
      ) : null}
    </>
  )
}
