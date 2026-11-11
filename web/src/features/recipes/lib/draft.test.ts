import { describe, expect, it } from 'vitest'
import { addLine, draftFromRecipe, draftToInput, emptyDraft, parseNumber, pickIngredient, removeLine, updateLine, validateDraft, type LineDraft, type RecipeDraft } from './draft'
import type { IngredientRef, Recipe } from '../types'

function filled(): RecipeDraft {
  return {
    ...emptyDraft(),
    name: '  Pancakes ',
    yield: '4',
    tags: ['Breakfast'],
    lines: [
      { key: 'a', ingredientId: 1, ingredientName: 'flour', quantity: '250', unit: 'g', optional: false, note: ' sifted ' },
      { key: 'b', ingredientId: 3, ingredientName: 'milk', quantity: '1,5', unit: 'dl', optional: true, note: '' },
    ],
    steps: [
      { key: 's1', text: 'Marinate', kind: 'advance', durationMinutes: '', leadTimeMinutes: '240', after: [], uses: [], image: '' },
      { key: 's2', text: 'Whisk', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '' },
    ],
  }
}

describe('parseNumber', () => {
  it.each([
    ['250', 250],
    [' 1.5 ', 1.5],
    ['1,5', 1.5],
    ['1/2', 0.5],
    ['1 1/2', 1.5],
    ['0', 0],
  ])('%j -> %d', (text, want) => {
    expect(parseNumber(text)).toBe(want)
  })

  it.each(['', '  ', 'abc', '1/0', '1e999', '-', '1..2'])('%j -> null', (text) => {
    expect(parseNumber(text)).toBeNull()
  })
})

describe('emptyDraft', () => {
  it('starts with Yield 4 and nothing else', () => {
    const d = emptyDraft()
    expect(d).toMatchObject({ name: '', yield: '4', readyMeal: false, tags: [], lines: [], steps: [], cooldownDays: '', leftoverUseByDays: '' })
  })
})

describe('draftToInput', () => {
  it('parses numbers, trims text and defaults blank overrides to the household default (null)', () => {
    const body = draftToInput(filled())
    expect(body.name).toBe('Pancakes')
    expect(body.yield).toBe(4)
    expect(body.cooldownDays).toBeNull()
    expect(body.leftoverUseByDays).toBeNull()
    expect(body.lines[0]).toMatchObject({ ingredientId: 1, quantity: 250, unit: 'g', note: 'sifted', optional: false })
    expect(body.lines[1]).toMatchObject({ quantity: 1.5, optional: true })
    expect(body.steps[0]).toMatchObject({ kind: 'advance', leadTimeMinutes: 240, durationMinutes: 0, after: [] })
    expect(body.steps[1]).toMatchObject({ kind: 'active', durationMinutes: 5, leadTimeMinutes: 0 })
  })

  it('keeps an explicit 0 override (leftovers the same day) distinct from blank', () => {
    const d = filled()
    d.leftoverUseByDays = '0'
    d.cooldownDays = '14'
    const body = draftToInput(d)
    expect(body.leftoverUseByDays).toBe(0)
    expect(body.cooldownDays).toBe(14)
  })

  it('skips lines without an Ingredient and sends source fields', () => {
    const d = filled()
    d.lines.push({ key: 'c', ingredientId: null, ingredientName: 'fl', quantity: '', unit: '', optional: false, note: '' })
    d.sourceUrl = ' https://example.test/p '
    d.sourceAttribution = 'Gran'
    const body = draftToInput(d)
    expect(body.lines).toHaveLength(2)
    expect(body.source).toEqual({ url: 'https://example.test/p', attribution: 'Gran' })
  })

  it('round-trips through draftFromRecipe', () => {
    const recipe: Recipe = {
      id: 9, name: 'Soup', description: 'Warm', yield: 2.5, readyMeal: false, tags: ['soup'],
      cooldownDays: 3, leftoverUseByDays: null, reheatMinutes: null, source: { url: '', attribution: '' }, image: '', imageUrl: '',
      lines: [{ ingredientId: 2, ingredient: 'leek', quantity: 2, unit: 'piece', optional: false, note: '' }],
      steps: [{ text: 'Simmer', kind: 'passive', durationMinutes: 20, leadTimeMinutes: 0, after: [], uses: [], image: '' }],
      archived: false, totalMinutes: 20, advanceMinutes: 0, advance: [], createdAt: '', updatedAt: '',
    }
    const d = draftFromRecipe(recipe)
    expect(d.yield).toBe('2.5')
    expect(d.cooldownDays).toBe('3')
    expect(d.leftoverUseByDays).toBe('')
    expect(d.lines[0]).toMatchObject({ ingredientName: 'leek', quantity: '2' })
    const back = draftToInput(d)
    expect(back).toMatchObject({ name: 'Soup', yield: 2.5, cooldownDays: 3, leftoverUseByDays: null })
    expect(back.steps[0]).toMatchObject({ kind: 'passive', durationMinutes: 20 })
  })
})

describe('validateDraft', () => {
  it('accepts a good draft', () => {
    expect(validateDraft(filled())).toEqual({})
  })

  it('flags name, Yield and missing lines', () => {
    const d = { ...emptyDraft(), name: ' ', yield: '0' }
    expect(validateDraft(d)).toEqual({ name: 'name_required', yield: 'yield_invalid', lines: 'lines_required' })
  })

  it('flags each bad line with its index', () => {
    const d = filled()
    d.lines[0] = { ...d.lines[0]!, ingredientId: null }
    d.lines[1] = { ...d.lines[1]!, quantity: '0', unit: ' ' }
    expect(validateDraft(d)).toEqual({
      'lines.0.ingredient': 'ingredient_required',
      'lines.1.quantity': 'quantity_invalid',
      'lines.1.unit': 'unit_required',
    })
  })

  it('a Ready Meal needs exactly one line', () => {
    const d = { ...filled(), readyMeal: true }
    expect(validateDraft(d)).toEqual({ lines: 'ready_meal_lines' })
    d.lines = d.lines.slice(0, 1)
    expect(validateDraft(d)).toEqual({})
  })

  it('checks Step text and the timing each kind needs', () => {
    const d = filled()
    d.steps = [
      { ...d.steps[0]!, leadTimeMinutes: '' },
      { ...d.steps[1]!, text: ' ' },
      { ...d.steps[1]!, kind: 'passive', durationMinutes: '' },
    ]
    expect(validateDraft(d)).toEqual({
      'steps.0.leadTimeMinutes': 'advance_needs_lead_time',
      'steps.1.text': 'step_text_required',
      'steps.2.durationMinutes': 'passive_needs_duration',
    })
  })

  it('overrides may be blank or whole numbers, not negative or text', () => {
    const d = filled()
    d.cooldownDays = '-1'
    d.leftoverUseByDays = 'soon'
    expect(validateDraft(d)).toEqual({ cooldownDays: 'cooldown_invalid', leftoverUseByDays: 'use_by_invalid' })
  })
})

describe('line operations', () => {
  const line = (key: string, extra: Partial<LineDraft> = {}): LineDraft => ({
    key, ingredientId: null, ingredientName: '', quantity: '', unit: '', optional: false, note: '', ...extra,
  })
  const withLines = (...lines: LineDraft[]): RecipeDraft => ({ ...emptyDraft(), name: 'Pie', lines })
  const flour: IngredientRef = { id: 7, name: 'Flour', baseUnit: 'g', conversions: [] }

  it('addLine appends a blank line with a fresh key and does not mutate', () => {
    const d = withLines(line('a'))
    const out = addLine(d)
    expect(d.lines).toHaveLength(1)
    expect(out.lines).toHaveLength(2)
    expect(out.lines[0]).toBe(d.lines[0])
    expect(out.lines[1]).toMatchObject({ ingredientId: null, ingredientName: '', quantity: '', unit: '', optional: false, note: '' })
    expect(out.lines[1]!.key).not.toBe('a')
    expect(addLine(out).lines[2]!.key).not.toBe(out.lines[1]!.key)
    expect(out.name).toBe('Pie')
  })

  it('updateLine patches only the line with that key', () => {
    const a = line('a', { quantity: '1' })
    const b = line('b', { quantity: '2' })
    const out = updateLine(withLines(a, b), 'b', { quantity: '250', note: 'sifted' })
    expect(out.lines[0]).toBe(a)
    expect(out.lines[1]).toMatchObject({ key: 'b', quantity: '250', note: 'sifted', unit: '' })
  })

  it('updateLine with an unknown key changes nothing', () => {
    const d = withLines(line('a'))
    expect(updateLine(d, 'zzz', { quantity: '9' }).lines).toEqual(d.lines)
  })

  it('pickIngredient sets id, name and the Base Unit but keeps quantity, optional and note', () => {
    const d = withLines(line('a', { quantity: '300', optional: true, note: 'plain', unit: 'cup' }))
    const out = pickIngredient(d, 'a', flour)
    expect(out.lines[0]).toEqual({ key: 'a', ingredientId: 7, ingredientName: 'Flour', quantity: '300', unit: 'g', optional: true, note: 'plain' })
  })

  it('removeLine drops the line and keeps the rest in order', () => {
    const out = removeLine(withLines(line('a'), line('b'), line('c')), 'b')
    expect(out.lines.map((l) => l.key)).toEqual(['a', 'c'])
    expect(removeLine(out, 'nope').lines).toHaveLength(2)
  })
})
