// B9-37 (RX-02): a new Recipe opens with one empty line and one empty Step, so the person starts typing at once. An untouched empty line or
// Step is dropped on Save: it is neither validated nor sent. Pure functions of lib/draft; the screen tests cover the same through the editor.
import { describe, expect, it } from 'vitest'
import { draftToInput, dropUntouched, emptyDraft, isUntouched, newLineDraft, sameDraft, validateDraft, type RecipeDraft, type StepDraft } from './draft'
import { newStepDraft } from './steps'

const filledLine = (over = {}) => ({ ...newLineDraft(), ingredientId: 7, ingredientName: 'garlic', quantity: '2', unit: 'clove', ...over })
const filledStep = (text: string, over: Partial<StepDraft> = {}): StepDraft => ({ ...newStepDraft(), text, durationMinutes: '5', ...over })
const named = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({ ...emptyDraft(), name: 'Aioli', ...over })

describe('emptyDraft (a new Recipe)', () => {
  it('has one empty line and one empty Step, and a Yield of 4', () => {
    const d = emptyDraft()
    expect(d.lines).toHaveLength(1)
    expect(d.steps).toHaveLength(1)
    expect(d.yield).toBe('4')
    expect(isUntouched(d.lines[0]!)).toBe(true)
    expect(isUntouched(d.steps[0]!)).toBe(true)
  })

  it('gives each call its own keys (two editors never share a row)', () => {
    const a = emptyDraft()
    const b = emptyDraft()
    expect(a.lines[0]!.key).not.toBe(b.lines[0]!.key)
    expect(a.steps[0]!.key).not.toBe(b.steps[0]!.key)
  })

  it('is the same as itself for the leave guard: a fresh new Recipe is clean (keys are ignored)', () => {
    expect(sameDraft(emptyDraft(), emptyDraft())).toBe(true)
  })

  it('removing the empty line is a change, adding a second one is a change', () => {
    const d = emptyDraft()
    expect(sameDraft(d, { ...d, lines: [] })).toBe(false)
    expect(sameDraft(d, { ...d, lines: [...d.lines, newLineDraft()] })).toBe(false)
  })
})

describe('isUntouched', () => {
  it('a blank line is untouched; a typed quantity, a note, a unit, an Optional tick or a picked Ingredient touch it', () => {
    expect(isUntouched(newLineDraft())).toBe(true)
    for (const patch of [{ quantity: '2' }, { note: 'ripe' }, { unit: 'g' }, { optional: true }, { ingredientId: 7, ingredientName: 'garlic' }, { baseRecipeId: 3 }]) {
      expect(isUntouched({ ...newLineDraft(), ...patch }), JSON.stringify(patch)).toBe(false)
    }
  })

  it('a line the Ready Meal rule made (auto) is never untouched', () => {
    expect(isUntouched({ ...newLineDraft(), auto: true, ingredientName: 'Lasagne', quantity: '1', unit: 'piece' })).toBe(false)
  })

  it('a blank Step is untouched; text, a duration, a lead time, a use, a photo or another kind touch it', () => {
    expect(isUntouched(newStepDraft())).toBe(true)
    const use = { key: 'u', ingredientId: null, ingredientName: '', quantity: '', unit: '' }
    for (const patch of [{ text: 'Mix' }, { durationMinutes: '5' }, { leadTimeMinutes: '60' }, { uses: [use] }, { image: 'abc' }, { kind: 'passive' as const }, { kind: 'advance' as const }]) {
      expect(isUntouched({ ...newStepDraft(), ...patch }), JSON.stringify(patch)).toBe(false)
    }
  })

  it('whitespace only is still blank', () => {
    expect(isUntouched({ ...newLineDraft(), note: '   ', quantity: ' ' })).toBe(true)
    expect(isUntouched({ ...newStepDraft(), text: '  \n' })).toBe(true)
  })
})

describe('dropUntouched', () => {
  it('returns the same object when nothing is untouched', () => {
    const d = named({ lines: [filledLine()], steps: [filledStep('Mix')] })
    expect(dropUntouched(d)).toBe(d)
  })

  it('removes the blank lines and Steps and keeps the others in order', () => {
    const a = filledLine({ key: 'a' })
    const b = filledLine({ key: 'b' })
    const out = dropUntouched(named({ lines: [newLineDraft(), a, newLineDraft(), b], steps: [newStepDraft(), filledStep('Mix'), newStepDraft()] }))
    expect(out.lines.map((l) => l.key)).toEqual(['a', 'b'])
    expect(out.steps.map((s) => s.text)).toEqual(['Mix'])
  })

  it('a removed Step takes its "After" references with it, and later ones shift down (as removeStep does)', () => {
    const one = filledStep('One', { key: 's1' })
    const blank = { ...newStepDraft(), key: 'sb' }
    const three = filledStep('Three', { key: 's3', after: [0, 1] })
    const out = dropUntouched(named({ steps: [one, blank, three] }))
    expect(out.steps.map((s) => s.key)).toEqual(['s1', 's3'])
    expect(out.steps[1]!.after).toEqual([0])
  })

  it('does not touch anything else (the Name, the Tags, the Courses)', () => {
    const d = named({ tags: ['quick'], courseIds: [1] })
    const out = dropUntouched(d)
    expect(out).toMatchObject({ name: 'Aioli', tags: ['quick'], courseIds: [1] })
  })
})

describe('validateDraft ignores untouched rows (and keeps the indexes of the rest)', () => {
  it('a Recipe with a name and only blank rows has exactly one error: lines_required', () => {
    expect(validateDraft(named({ lines: [newLineDraft()], steps: [newStepDraft()] }))).toEqual({ lines: 'lines_required' })
  })

  it('a touched line without an Ingredient is still reported, at its own index', () => {
    const errors = validateDraft(named({ lines: [newLineDraft(), { ...newLineDraft(), quantity: '2' }, filledLine()], steps: [newStepDraft()] }))
    expect(errors['lines.1.ingredient']).toBe('ingredient_required')
    expect(Object.keys(errors).filter((k) => k.startsWith('lines.0'))).toEqual([])
    expect(errors['lines.2.ingredient']).toBeUndefined()
    expect(errors.lines).toBeUndefined()
  })

  it('a touched Step without text is reported at its index; a blank Step before it is not', () => {
    const errors = validateDraft(named({ lines: [filledLine()], steps: [newStepDraft(), { ...newStepDraft(), durationMinutes: '5' }] }))
    expect(errors['steps.1.text']).toBe('step_text_required')
    expect(errors['steps.0.text']).toBeUndefined()
  })

  it('a Base recipe still needs no lines', () => {
    expect(validateDraft(named({ baseRecipe: true, yieldUnit: 'g', yield: '800', lines: [newLineDraft()], steps: [newStepDraft()] }))).toEqual({})
  })
})

describe('draftToInput sends only what the person touched', () => {
  it('no blank line, no blank Step', () => {
    const body = draftToInput(named({ lines: [newLineDraft(), filledLine(), newLineDraft()], steps: [filledStep('Mix'), newStepDraft()] }))
    expect(body.lines).toHaveLength(1)
    expect(body.steps).toHaveLength(1)
    expect(body.steps[0]!.text).toBe('Mix')
  })

  it('"After" follows the dropped Step (the body never points at a Step that is not sent)', () => {
    const body = draftToInput(named({ lines: [filledLine()], steps: [filledStep('One'), newStepDraft(), filledStep('Three', { after: [0] })] }))
    expect(body.steps.map((s) => s.text)).toEqual(['One', 'Three'])
    expect(body.steps[1]!.after).toEqual([0])
  })
})
