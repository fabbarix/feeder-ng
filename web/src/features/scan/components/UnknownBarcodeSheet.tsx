import type { IngredientChoice, UnknownFormValues, UnknownMode } from '../lib/unknownForm'

export interface UnknownBarcodeSheetProps {
  open: boolean
  onClose: () => void
  mode: UnknownMode
  /** the Shop-only choice names this Shop */
  shopName: string
  /** the Ingredients to search */
  ingredients: IngredientChoice[]
  /** a price-valued weighed code: shown to explain why the weight is asked */
  priceText?: string
  onSave: (values: UnknownFormValues) => void
}

/**
 * The "what is this?" bottom sheet (functional spec §10.1), titled "What is this?" (pack) or "What is this weighed
 * item?" (weighed, weighed_price). Fields: Ingredient (a searchable list of `ingredients`; typing a name that
 * matches none offers `Create "<name>"`, whose Base Unit is taken from the unit chosen... for a new Ingredient the
 * form asks for the Pack size unit and uses its Base Unit), Pack size + Unit (pack mode only), Product name
 * (prefilled from lib/unknownForm.suggestedName until the User edits it), scope radios "Any Shop" / "This Shop only"
 * (<shopName>) (pack mode only), Weight (g) (weighed_price only). "Save" validates with validateUnknownForm, shows
 * the errors under the fields and calls onSave with the values only when valid. Render and wire only. Stub until implemented.
 */
export function UnknownBarcodeSheet(props: UnknownBarcodeSheetProps) {
  void props
  return null
}
