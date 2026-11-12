// The Frozen Use-by field (Recipe editor: optional; Settings > Household: required). Pure. STUB (red).
export type FrozenUseByParse = { ok: true; value: number | null } | { ok: false; error: string }

/** Whole days 1 to 365. Blank is null when optional, an error when required. */
export function parseFrozenUseBy(_raw: string, _opts: { required: boolean }): FrozenUseByParse {
  return { ok: false, error: '' }
}

/** Helper under the Recipe field: "Blank uses the Household's 90 days". */
export function frozenUseByHelper(_householdDays: number): string {
  return ''
}
