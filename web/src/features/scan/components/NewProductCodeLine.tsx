// B9-41: the line at the top of the new-Product sheet. A barcode reads as printed under the bars ("8 000000 009999 · not in Feeder yet",
// SSP-20); a weighed code reads "312 g · weighed at Coop · item 012300" with the Scales icon (SSP-07). It is the sheet's description. Render only.
import { Icon } from '../../../ui/Icon'
import type { UnitSystem } from '../../../lib/units'
import { printedCode, weighedLineParts } from '../lib/newProductSelect'
import { newProductStrings } from '../newProductStrings'

export type NewProductCodeLineProps = { id?: string } & (
  | { barcode: string; weighed?: never }
  | { weighed: { grams: number; itemCode: string }; shopName: string; system: UnitSystem; barcode?: never }
)

export function NewProductCodeLine(p: NewProductCodeLineProps) {
  if (p.weighed) {
    // the weight is the figure to check against the label: set in the stronger weight, as mocks/ssp-07-weighed-sheet.html draws it
    const { weight, rest } = weighedLineParts(p.weighed.grams, p.shopName, p.weighed.itemCode, p.system)
    return (
      <p id={p.id} className="new-product__code">
        <Icon name="weigh" size={16} />
        <span>
          <span className="new-product__code-digits">{weight}</span>
          {rest}
        </span>
      </p>
    )
  }
  const code = printedCode(p.barcode)
  return (
    <p id={p.id} className="new-product__code">
      <Icon name="scan" size={16} />
      <span>
        <span className="new-product__code-digits" role="img" aria-label={code.spoken}>
          {code.text}
        </span>
        {newProductStrings.notKnownSuffix}
      </span>
    </p>
  )
}
