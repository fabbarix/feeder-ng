// B9-48 (SET-05): the pure rules of the "Keeping" tile: one draft of Base Unit, Shelf Life, Frozen Shelf Life and Restock level,
// dirty after one change, one PATCH body holding only what changed, and the row hints. Plain TypeScript, no React.
import type { BaseUnit } from '../../../lib/units'
import { strings } from '../strings'
import type { Ingredient, IngredientKind, IngredientPatch } from '../types'
import { MAX_SHELF_LIFE_DAYS } from './conversionForm'
import { kindOf, parseRestockText, restockText } from './kind'

export interface KeepingDraft {
  baseUnit: BaseUnit
  /** Whole days, or null for "Not set". */
  shelfLifeDays: number | null
  frozenShelfLifeDays: number | null
  /** What the Restock level control shows: '' for none, the Base Unit amount otherwise (lib/kind restockText). */
  restockText: string
}

export type KeepingErrors = {
  shelfLife?: string
  frozenShelfLife?: string
  restock?: string
}

/** The Keeping draft of a saved Ingredient. */
export function keepingDraft(saved: Ingredient): KeepingDraft {
  return {
    baseUnit: saved.baseUnit,
    shelfLifeDays: saved.shelfLifeDays ?? null,
    frozenShelfLifeDays: saved.frozenShelfLifeDays ?? null,
    restockText: restockText(saved.restockLevel ?? null),
  }
}

/** The Restock level a text stands for: null for blank, the number when it parses, undefined when it does not. */
function restockValue(text: string): number | null | undefined {
  const parsed = parseRestockText(text)
  if (parsed.ok) return parsed.value
  const n = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(n) ? n : undefined
}

function restockChanged(saved: Ingredient, text: string): boolean {
  const value = restockValue(text)
  return value === undefined || value !== (saved.restockLevel ?? null)
}

/** True when the draft differs from what is saved (a Restock level typed another way, "500,0", is the same value). */
export function isKeepingDirty(saved: Ingredient, draft: KeepingDraft): boolean {
  return (
    draft.baseUnit !== saved.baseUnit ||
    draft.shelfLifeDays !== (saved.shelfLifeDays ?? null) ||
    draft.frozenShelfLifeDays !== (saved.frozenShelfLifeDays ?? null) ||
    restockChanged(saved, draft.restockText)
  )
}

/**
 * The ONE PATCH body of a Save changes: only the fields that changed, a cleared value as null. Food never sends a Restock level
 * and a Supply never sends a Shelf Life.
 */
export function keepingPatch(saved: Ingredient, draft: KeepingDraft): IngredientPatch {
  const patch: IngredientPatch = {}
  if (draft.baseUnit !== saved.baseUnit) patch.baseUnit = draft.baseUnit
  if (kindOf(saved) === 'supply') {
    if (restockChanged(saved, draft.restockText)) {
      const value = restockValue(draft.restockText)
      if (value !== undefined) patch.restockLevel = value
    }
    return patch
  }
  if (draft.shelfLifeDays !== (saved.shelfLifeDays ?? null)) patch.shelfLifeDays = draft.shelfLifeDays
  if (draft.frozenShelfLifeDays !== (saved.frozenShelfLifeDays ?? null)) patch.frozenShelfLifeDays = draft.frozenShelfLifeDays
  return patch
}

const validDays = (days: number | null) => days === null || (Number.isInteger(days) && days >= 1 && days <= MAX_SHELF_LIFE_DAYS)

/** The problems of a draft, each at its field ({} when valid). Only the kind's own fields are checked. */
export function validateKeeping(draft: KeepingDraft, kind: IngredientKind): KeepingErrors {
  const errors: KeepingErrors = {}
  if (kind === 'supply') {
    const parsed = parseRestockText(draft.restockText)
    if (!parsed.ok) errors.restock = parsed.error
    return errors
  }
  if (!validDays(draft.shelfLifeDays)) errors.shelfLife = strings.sheet.shelfLifeInvalid
  if (!validDays(draft.frozenShelfLifeDays)) errors.frozenShelfLife = strings.sheet.shelfLifeInvalid
  return errors
}

/** The hint under a Shelf Life row: what it was while changed, else what "Not set" means, else (frozen) what it does. */
export function shelfLifeHint(variant: 'shelfLife' | 'frozen', saved: number | null, draft: number | null): string | undefined {
  if (saved !== draft) return strings.keeping.changedFrom(saved === null ? strings.keeping.notSetLower : strings.shelfLife(saved))
  if (variant === 'shelfLife') return draft === null ? strings.noShelfLife : undefined
  return draft === null ? strings.keeping.frozenNotSet : strings.frozenShelfLifeHint
}

/** The Base Unit row's hint: why it cannot change while something uses the Ingredient. */
export function baseUnitHint(referenceCount: number): string | undefined {
  return referenceCount > 0 ? strings.keeping.baseUnitLocked(referenceCount) : undefined
}

/** The number a Restock level text stands for: null when blank, else the number as typed (even 0, for the check to word). */
export function restockNumber(text: string): number | null {
  const value = restockValue(text)
  return value === undefined ? null : value
}

/** The − and + step of a Restock level: one piece, or 50 g or ml (typing reaches any amount). */
export function restockStep(baseUnit: BaseUnit): number {
  return baseUnit === 'piece' ? 1 : 50
}
