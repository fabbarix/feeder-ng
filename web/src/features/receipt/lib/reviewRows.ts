// The view of each review row: its words, its state and what its buttons do (docs/design/receipt-reading.md 3.4). Pure.
import { changeText, rowTitle, type Money } from './reviewCopy'
import { isAddComplete, isChecked } from './reviewState'
import type { Proposal, ReceiptRow, ReviewState } from '../types'

export interface ReviewRowView {
  id: string
  title: string
  /** The change as words ("€1.29 → €1.35 per pack"), or "Not on the receipt". */
  change: string
  /** The receipt line as printed, when there is one. */
  line?: string
  checked: boolean
  /** An Add whose form is not complete: its checkbox is off until the form is filled. */
  checkDisabled: boolean
  /** An Add whose form is not complete: the row opens the form. */
  needsForm: boolean
  /** An Add whose form is complete. */
  ready: boolean
  isAdd: boolean
  isMissing: boolean
  /** Not on the receipt: the Scanned row's count and Price, end-aligned. */
  value?: string
  subValue?: string
  highlighted: boolean
}

export interface ReviewRowsInput {
  rows: ReceiptRow[]
  state: ReviewState
  money: Money
  today: string
  highlightId?: string
}

export function reviewRowViews(proposals: Proposal[], o: ReviewRowsInput): ReviewRowView[] {
  return proposals.map((p) => {
    const isAdd = p.kind === 'add'
    const isMissing = p.kind === 'missing'
    const complete = isAdd && isAddComplete(o.state.adds[p.id])
    const row = isMissing ? o.rows.find((r) => r.row === p.row) : undefined
    const view: ReviewRowView = {
      id: p.id,
      title: rowTitle(p, o.rows),
      change: changeText(p, { money: o.money, today: o.today }),
      checked: isChecked(o.state, p),
      checkDisabled: isAdd && !complete,
      needsForm: isAdd && !complete,
      ready: complete,
      isAdd,
      isMissing,
      highlighted: o.highlightId === p.id,
    }
    if (p.text !== '' && !isMissing) view.line = p.text
    if (row) {
      view.value = `×${row.scans}`
      if (row.priceCents > 0) view.subValue = o.money(row.priceCents)
    }
    return view
  })
}
