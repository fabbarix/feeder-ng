// The Add… of a "Not scanned" line through the new-Product sheet without a barcode (design 3.4): what the sheet opens with, and its
// values as the Add's draft. Pure TypeScript, no React.
import type { NewProductInitial } from '../../scan/lib/newProductSelect'
import { packSizeInBase, type IngredientChoice, type UnknownFormValues } from '../../scan/lib/unknownForm'
import type { AddDraft, Proposal } from '../types'

/** The sheet's values as the Add's draft: an existing Ingredient by id, a new one by name, Base Unit and kind; the pack size in Base Units, whole. */
export function draftFromValues(values: UnknownFormValues): AddDraft {
  const choice = values.ingredient
  const ingredient: AddDraft['ingredient'] = !choice
    ? null
    : choice.id !== undefined
      ? { id: choice.id }
      : { name: choice.name.trim(), baseUnit: choice.baseUnit, kind: choice.kind ?? 'food' }
  const base = choice?.baseUnit ?? 'g'
  const size = packSizeInBase(values.packSize, values.packUnit, base)
  return { ingredient, productName: values.productName.trim(), packSize: size === null ? 0 : Math.round(size), scope: values.scope }
}

/**
 * What the sheet opens with: the Add's saved draft when it is edited again (its Ingredient found among the choices), else the receipt
 * line's name and its pack size, or its weight in grams.
 */
export function initialFromAdd(proposal: Proposal, draft: AddDraft | undefined, choices: IngredientChoice[]): NewProductInitial {
  if (draft) {
    const ing = draft.ingredient
    const ingredient: IngredientChoice | undefined = !ing ? undefined : 'id' in ing ? choices.find((c) => c.id === ing.id) : { name: ing.name, baseUnit: ing.baseUnit, kind: ing.kind }
    const out: NewProductInitial = { productName: draft.productName }
    if (ingredient) out.ingredient = ingredient
    if (draft.packSize > 0) {
      out.packSize = draft.packSize
      out.packUnit = ingredient?.baseUnit ?? 'g'
    }
    if (draft.scope) out.scope = draft.scope
    return out
  }
  const after = proposal.after
  const out: NewProductInitial = {}
  if (after.name) out.productName = after.name
  if (after.packSize !== undefined && after.packSize > 0) {
    out.packSize = after.packSize
    if (after.packUnit) out.packUnit = after.packUnit
  } else if (after.grams !== undefined && after.grams > 0) {
    out.packSize = after.grams
    out.packUnit = 'g'
  }
  return out
}
