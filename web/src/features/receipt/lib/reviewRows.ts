// The view of each review row: its words, its state and what its buttons do (docs/design/receipt-reading.md 3.4; B9-50 SSP-08: R-E rows,
// no checkbox on a Not scanned row until it is set up, every button named after its line). Pure.
import { changeText, rowTitle, type Money } from './reviewCopy'
import { bestProductName } from './receiptMatches'
import { isAddComplete, isChecked } from './reviewState'
import { receiptStrings as t } from '../strings'
import type { Proposal, ReceiptRow, ReviewState } from '../types'

export interface ReviewRowView {
  id: string
  title: string
  /** The change as words ("€1.29 → €1.35 per pack"), or "Not on the receipt". An Add's is its state at the row's end ("450 g · €2.25"). */
  change: string
  /** The receipt line as printed, when there is one. */
  line?: string
  checked: boolean
  /** B9-50: the row has a checkbox: every row but an Add that is not set up yet. */
  hasCheckbox: boolean
  /** The checkbox's name: the title and the change (one Product can have two rows), with the line's position when two are the same. */
  checkName: string
  /** An Add whose form is not complete: the row opens the form. */
  needsForm: boolean
  /** An Add whose form is complete. */
  ready: boolean
  isAdd: boolean
  isMissing: boolean
  /** The state at the row's end: an Add's amount and price; Not on the receipt: the Scanned row's count. */
  value?: string
  subValue?: string
  /** The name of the row's one button: "Add <printed line>", "Edit <printed line>", "Remove <Product>", "Undo remove of <Product>". */
  buttonName?: string
  /** B9-50: a Not scanned line whose name is a Product: "Kitchen roll 4 pack is a Product". */
  productMatch?: string
  highlighted: boolean
}

export interface ReviewRowsInput {
  rows: ReceiptRow[]
  state: ReviewState
  money: Money
  today: string
  highlightId?: string
  /** B9-50: the Household's Products, for "{Product} is a Product" */
  products?: { name: string }[]
}

/** The text a row's names are made of, told apart by position when two rows say the same ("KITCHEN ROLL 4 PACK, line 7"). */
function distinct(texts: string[], positions: number[]): string[] {
  const count = new Map<string, number>()
  for (const s of texts) count.set(s, (count.get(s) ?? 0) + 1)
  return texts.map((s, i) => ((count.get(s) ?? 0) > 1 ? t.atLine(s, positions[i] ?? i + 1) : s))
}

/** A row's position on the receipt (1-based): its line for an Add, else its Scanned row. */
const position = (p: Proposal) => (p.line >= 0 ? p.line + 1 : p.row + 1)

export function reviewRowViews(proposals: Proposal[], o: ReviewRowsInput): ReviewRowView[] {
  const titles = proposals.map((p) => rowTitle(p, o.rows))
  const changes = proposals.map((p) => changeText(p, { money: o.money, today: o.today }))
  const positions = proposals.map(position)
  const checkNames = distinct(
    proposals.map((_, i) => (changes[i] !== '' ? `${titles[i]}, ${changes[i]}` : (titles[i] ?? ''))),
    positions,
  )
  const lineNames = distinct(
    proposals.map((p, i) => (p.text !== '' ? p.text : (titles[i] ?? ''))),
    positions,
  )
  const rowNames = distinct(titles, positions)
  return proposals.map((p, i) => {
    const isAdd = p.kind === 'add'
    const isMissing = p.kind === 'missing'
    const complete = isAdd && isAddComplete(o.state.adds[p.id])
    const row = isMissing ? o.rows.find((r) => r.row === p.row) : undefined
    const title = titles[i] ?? ''
    const checked = isChecked(o.state, p)
    const view: ReviewRowView = {
      id: p.id,
      title,
      change: changes[i] ?? '',
      checked,
      hasCheckbox: !isAdd || complete,
      checkName: checkNames[i] ?? title,
      needsForm: isAdd && !complete,
      ready: complete,
      isAdd,
      isMissing,
      highlighted: o.highlightId === p.id,
    }
    if (p.text !== '' && !isMissing) view.line = p.text
    if (isAdd) {
      view.value = view.change
      view.buttonName = complete ? t.editLine(lineNames[i] ?? title) : t.addLine(lineNames[i] ?? title)
      const product = o.products && o.products.length > 0 ? bestProductName(p.after.name ?? p.text, o.products) : undefined
      if (product) view.productMatch = t.isProduct(product)
    }
    if (isMissing) view.buttonName = checked ? t.keepRow(rowNames[i] ?? title) : t.removeRow(rowNames[i] ?? title)
    if (row) {
      view.value = `×${row.scans}`
      if (row.priceCents > 0) view.subValue = o.money(row.priceCents)
    }
    return view
  })
}
