import type { Recipe, RecipeInput, StepKind } from '../types'

// The editor's form state: everything the User types is a string until draftToInput parses it.

export interface LineDraft {
  /** Stable React key; never sent. */
  key: string
  ingredientId: number | null
  ingredientName: string
  quantity: string
  unit: string
  optional: boolean
  note: string
}

export interface UseDraft {
  ingredientId: number | null
  ingredientName: string
  quantity: string
  unit: string
}

export interface StepDraft {
  key: string
  text: string
  kind: StepKind
  durationMinutes: string
  leadTimeMinutes: string
  after: number[]
  uses: UseDraft[]
  image: string
}

export interface RecipeDraft {
  name: string
  description: string
  yield: string
  readyMeal: boolean
  tags: string[]
  cooldownDays: string
  leftoverUseByDays: string
  sourceUrl: string
  sourceAttribution: string
  image: string
  lines: LineDraft[]
  steps: StepDraft[]
}

/** field path ('name', 'yield', 'lines', 'lines.0.quantity', 'steps.1.durationMinutes', ...) -> error code. */
export type DraftErrors = Record<string, string>

let keyCounter = 0

/** A React key for a new line or Step. */
export function newKey(prefix: string): string {
  keyCounter += 1
  return `${prefix}${keyCounter}`
}

/** A blank Recipe: Yield "4", no lines, no Steps. */
export function emptyDraft(): RecipeDraft {
  return {
    name: '',
    description: '',
    yield: '4',
    readyMeal: false,
    tags: [],
    cooldownDays: '',
    leftoverUseByDays: '',
    sourceUrl: '',
    sourceAttribution: '',
    image: '',
    lines: [],
    steps: [],
  }
}

const numText = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n))
const minutesText = (n: number): string => (n ? String(n) : '')

/** Fills a draft from a stored Recipe (numbers become strings; null overrides become ''). */
export function draftFromRecipe(recipe: Recipe): RecipeDraft {
  return {
    name: recipe.name,
    description: recipe.description,
    yield: String(recipe.yield),
    readyMeal: recipe.readyMeal,
    tags: [...recipe.tags],
    cooldownDays: numText(recipe.cooldownDays),
    leftoverUseByDays: numText(recipe.leftoverUseByDays),
    sourceUrl: recipe.source.url,
    sourceAttribution: recipe.source.attribution,
    image: recipe.image,
    lines: recipe.lines.map((l) => ({
      key: newKey('line'),
      ingredientId: l.ingredientId,
      ingredientName: l.ingredient ?? '',
      quantity: String(l.quantity),
      unit: l.unit,
      optional: l.optional,
      note: l.note,
    })),
    steps: recipe.steps.map((s) => ({
      key: newKey('step'),
      text: s.text,
      kind: s.kind,
      durationMinutes: minutesText(s.durationMinutes),
      leadTimeMinutes: minutesText(s.leadTimeMinutes),
      after: [...s.after],
      uses: s.uses.map((u) => ({ ingredientId: u.ingredientId, ingredientName: '', quantity: String(u.quantity), unit: u.unit })),
      image: s.image,
    })),
  }
}

const FRACTION = /^(-?\d+)\/(\d+)$/
const MIXED = /^(-?\d+)\s+(\d+)\/(\d+)$/
const DECIMAL = /^-?(\d+\.?\d*|\.\d+)$/

/**
 * Parses a typed number: trims, accepts a decimal comma ("1,5"), "a/b" ("1/2") and "n a/b" ("1 1/2").
 * Returns null for blank or anything else, for non-finite results and for a zero denominator.
 */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.')
  let value: number
  let m: RegExpExecArray | null
  if ((m = MIXED.exec(t))) {
    const den = Number(m[3])
    if (den === 0) return null
    const whole = Number(m[1])
    value = whole + (whole < 0 ? -1 : 1) * (Number(m[2]) / den)
  } else if ((m = FRACTION.exec(t))) {
    const den = Number(m[2])
    if (den === 0) return null
    value = Number(m[1]) / den
  } else if (DECIMAL.test(t)) {
    value = Number(t)
  } else {
    return null
  }
  return Number.isFinite(value) ? value : null
}

/** Parses an optional number: blank means 0 (the field is not given). */
const numberOrZero = (text: string): number => parseNumber(text) ?? 0

/** Parses an optional override: blank means null (the household default). */
const overrideOf = (text: string): number | null => (text.trim() === '' ? null : parseNumber(text))

/**
 * Builds the API body. Names/notes trimmed; blank cooldown/use-by -> null (household default),
 * "0" -> 0; blank durations/lead times -> 0; unparsable numbers -> NaN-free defaults are NOT
 * applied: call validateDraft first and only convert a draft without errors. Lines without an
 * Ingredient are skipped. Advance Steps are sent with after [].
 */
export function draftToInput(draft: RecipeDraft): RecipeInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    yield: numberOrZero(draft.yield),
    readyMeal: draft.readyMeal,
    tags: [...draft.tags],
    cooldownDays: overrideOf(draft.cooldownDays),
    leftoverUseByDays: overrideOf(draft.leftoverUseByDays),
    source: { url: draft.sourceUrl.trim(), attribution: draft.sourceAttribution.trim() },
    image: draft.image,
    lines: draft.lines
      .filter((l) => l.ingredientId !== null)
      .map((l) => ({
        ingredientId: l.ingredientId!,
        quantity: numberOrZero(l.quantity),
        unit: l.unit.trim().toLowerCase(),
        optional: l.optional,
        note: l.note.trim(),
      })),
    steps: draft.steps.map((s) => ({
      text: s.text.trim(),
      kind: s.kind,
      durationMinutes: s.kind === 'advance' ? 0 : numberOrZero(s.durationMinutes),
      leadTimeMinutes: s.kind === 'advance' ? numberOrZero(s.leadTimeMinutes) : 0,
      after: s.kind === 'advance' ? [] : [...s.after],
      uses: s.uses
        .filter((u) => u.ingredientId !== null)
        .map((u) => ({ ingredientId: u.ingredientId!, quantity: numberOrZero(u.quantity), unit: u.unit.trim().toLowerCase() })),
      image: s.image,
    })),
  }
}

const isWhole = (n: number) => Number.isInteger(n)

/**
 * Quick client-side checks before saving (the server re-validates). Codes:
 *  name: name_required; yield: yield_invalid;
 *  lines: lines_required (none) | ready_meal_lines (Ready Meal without exactly one);
 *  lines.N.ingredient: ingredient_required; lines.N.quantity: quantity_invalid; lines.N.unit: unit_required;
 *  cooldownDays: cooldown_invalid; leftoverUseByDays: use_by_invalid;
 *  steps.N.text: step_text_required; steps.N.durationMinutes: passive_needs_duration;
 *  steps.N.leadTimeMinutes: advance_needs_lead_time.
 */
export function validateDraft(draft: RecipeDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (draft.name.trim() === '') errors.name = 'name_required'
  const yieldValue = parseNumber(draft.yield)
  if (yieldValue === null || yieldValue <= 0 || yieldValue > 100) errors.yield = 'yield_invalid'

  if (draft.lines.length === 0) errors.lines = 'lines_required'
  else if (draft.readyMeal && draft.lines.length !== 1) errors.lines = 'ready_meal_lines'
  draft.lines.forEach((l, i) => {
    if (l.ingredientId === null) errors[`lines.${i}.ingredient`] = 'ingredient_required'
    const q = parseNumber(l.quantity)
    if (q === null || q <= 0) errors[`lines.${i}.quantity`] = 'quantity_invalid'
    if (l.unit.trim() === '') errors[`lines.${i}.unit`] = 'unit_required'
  })

  const cooldown = overrideOf(draft.cooldownDays)
  if (cooldown !== null && (cooldown < 0 || cooldown > 365 || !isWhole(cooldown))) errors.cooldownDays = 'cooldown_invalid'
  if (draft.cooldownDays.trim() !== '' && cooldown === null) errors.cooldownDays = 'cooldown_invalid'
  const useBy = overrideOf(draft.leftoverUseByDays)
  if (draft.leftoverUseByDays.trim() !== '' && (useBy === null || useBy < 0 || useBy > 30 || !isWhole(useBy))) {
    errors.leftoverUseByDays = 'use_by_invalid'
  }

  draft.steps.forEach((s, i) => {
    if (s.text.trim() === '') errors[`steps.${i}.text`] = 'step_text_required'
    if (s.kind === 'passive' && numberOrZero(s.durationMinutes) <= 0) errors[`steps.${i}.durationMinutes`] = 'passive_needs_duration'
    if (s.kind === 'advance' && numberOrZero(s.leadTimeMinutes) <= 0) errors[`steps.${i}.leadTimeMinutes`] = 'advance_needs_lead_time'
  })
  return errors
}

/**
 * Maps a server validation error (field path and reason, as sent by the API) onto the draft's error key.
 * Whole-Step timing problems land on the field the User types for that kind.
 */
export function serverErrorKey(field: string, reason: string): string {
  const step = /^steps\[(\d+)\]$/.exec(field)
  if (step) {
    const i = step[1]
    if (reason === 'passive_needs_duration') return `steps.${i}.durationMinutes`
    if (reason === 'advance_needs_lead_time') return `steps.${i}.leadTimeMinutes`
    return `steps.${i}.text`
  }
  return field
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\.ingredientId$/, '.ingredient')
    .replace('source.url', 'sourceUrl')
    .replace('source.attribution', 'sourceAttribution')
}
