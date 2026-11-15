// B9-50 (SSP-08): the state of the "Is it one of these?" step of a receipt line's Add… (no barcode): the chosen match, the Lines left for
// "Other Lines", the note and the "Use <Product>" primary, and the Product a new name already is. Over lib/receiptMatchStep; the form
// (useNewProductForm) is told when a Line match is picked.
import { useState } from 'react'
import type { LineCandidate, LineChip, LineChips } from '../lib/lineChoice'
import { chipOfLineMatch, initialMatchKey, matchKey, otherLines, productNamed, productNote } from '../lib/receiptMatchStep'
import type { IngredientChoice } from '../lib/unknownForm'
import type { ReceiptLineInfo, ReceiptMatch } from '../components/NewProductSheet'

export interface ReceiptMatchStepOptions {
  /** the sheet has no barcode (a receipt line's Add…): only then are the matches offered */
  noBarcode: boolean
  matches: ReceiptMatch[] | undefined
  receiptLine: ReceiptLineInfo | undefined
  lines: LineCandidate[]
  /** the form's Line chips */
  chips: LineChips
  products: { id?: number; name?: string }[]
  /** the form's chosen Ingredient (a new one has no id) */
  choice: IngredientChoice | null
  onPickLine: (chip: LineChip) => void
  onUseProduct?: (productId: number) => void
}

export function useReceiptMatchStep(o: ReceiptMatchStepOptions) {
  const matches = o.noBarcode ? (o.matches ?? []) : []
  const [chosen, setChosen] = useState<string | null>(() => initialMatchKey(matches))
  const active = matches.length > 0
  const product = matches.find((m): m is Extract<ReceiptMatch, { kind: 'product' }> => m.kind === 'product' && matchKey(m) === chosen)

  const pick = (m: ReceiptMatch) => {
    if (m.kind === 'product') {
      setChosen(matchKey(m))
      return
    }
    // A Line match goes on as its Line chip does; no Product stays chosen.
    setChosen(null)
    o.onPickLine(chipOfLineMatch(m, o.chips))
  }

  // Something else: a new name that is a Product already (the guard works without the Ingredient lookup).
  const clash = o.noBarcode && o.onUseProduct && o.choice && o.choice.id === undefined ? productNamed(o.choice.name, o.products) : undefined

  return {
    active,
    matches,
    chosen,
    pick,
    /** the Lines for "Other Lines" (all of them when there is no match) */
    chips: active ? otherLines(o.chips, matches) : o.chips,
    product,
    note: product ? productNote(product, o.receiptLine, o.lines) : undefined,
    use: product && o.onUseProduct ? () => o.onUseProduct?.(product.productId) : undefined,
    clash,
  }
}
