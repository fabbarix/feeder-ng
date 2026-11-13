// The Frozen Use-by field (Recipe editor: optional; Settings > Household: required). Pure.
export type FrozenUseByParse = { ok: true; value: number | null } | { ok: false; error: string }

const ERROR = 'Enter whole days from 1 to 365.'

/** Whole days 1 to 365. Blank is null when optional, an error when required. */
export function parseFrozenUseBy(raw: string, opts: { required: boolean }): FrozenUseByParse {
  const text = raw.trim()
  if (text === '') return opts.required ? { ok: false, error: ERROR } : { ok: true, value: null }
  if (!/^\d+$/.test(text)) return { ok: false, error: ERROR }
  const value = Number(text)
  return value >= 1 && value <= 365 ? { ok: true, value } : { ok: false, error: ERROR }
}

/** Helper under the Recipe field: "Blank uses the Household's 90 days". */
export function frozenUseByHelper(householdDays: number): string {
  return `Blank uses the Household's ${householdDays} days.`
}
