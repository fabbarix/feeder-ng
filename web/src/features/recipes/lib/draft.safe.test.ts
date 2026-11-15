// B9-31 (SAFE-01, SAFE-10): the pure half of the editor's safety net, in lib/draft.ts.
//
//   sameDraft(a, b): boolean               "dirty" is !sameDraft(current, opened). It compares what Save would send (draftToInput), so:
//                                          leading and trailing spaces do not count, line and Step keys do not, a reordered list does,
//                                          and a line the person added but has not filled (draftToInput skips it) DOES count.
//   rekeyDraft(draft): RecipeDraft         fresh keys for every line, Step and use: a draft read back after a reload may hold keys the
//                                          new session's counter hands out again.
//   removeLineWithUndo(draft, key)         -> { draft, removed: { line, index } | null }   (null: unknown key, draft unchanged)
//   restoreLine(draft, removed)            puts the line back at its index (clamped), with its key and content
import { describe, expect, it } from 'vitest'
import { draftFromRecipe, draftToInput, emptyDraft, removeLineWithUndo, rekeyDraft, restoreLine, sameDraft, type RecipeDraft } from './draft'
import { recipe } from '../fixtures.test-helper'

const stored = (): RecipeDraft => draftFromRecipe(recipe())
const line = (key: string, name: string) => ({ key, ingredientId: 1, ingredientName: name, quantity: '1', unit: 'g', optional: false, note: '' })

describe('sameDraft', () => {
  it('a draft is the same as itself and as a copy with fresh keys', () => {
    expect(sameDraft(stored(), stored())).toBe(true)
    expect(sameDraft(stored(), rekeyDraft(stored()))).toBe(true)
  })

  it('leading and trailing spaces do not count (name, description, notes, Step text, source)', () => {
    const a = stored()
    const b: RecipeDraft = {
      ...a,
      name: `  ${a.name}  `,
      description: ' ',
      sourceUrl: ' ',
      lines: a.lines.map((l) => ({ ...l, note: `${l.note} ` })),
      steps: a.steps.map((s) => ({ ...s, text: `\n${s.text} ` })),
    }
    expect(sameDraft(a, b)).toBe(true)
  })

  it('a changed value counts: name, a quantity, a Step text, a tag, a Course, the Photo', () => {
    const a = stored()
    expect(sameDraft(a, { ...a, name: 'Roast trays' })).toBe(false)
    expect(sameDraft(a, { ...a, lines: a.lines.map((l) => ({ ...l, quantity: '4' })) })).toBe(false)
    expect(sameDraft(a, { ...a, steps: a.steps.map((s, i) => (i === 0 ? { ...s, text: 'Marinate overnight' } : s)) })).toBe(false)
    expect(sameDraft(a, { ...a, tags: [...a.tags, 'new'] })).toBe(false)
    expect(sameDraft(a, { ...a, courseIds: [2] })).toBe(false)
    expect(sameDraft(a, { ...a, image: 'abc' })).toBe(false)
  })

  it('a reordered list counts (lines and Steps)', () => {
    const a = { ...stored(), lines: [line('a', 'flour'), line('b', 'milk')] }
    expect(sameDraft(a, { ...a, lines: [a.lines[1]!, a.lines[0]!] })).toBe(false)
    const s = stored()
    expect(sameDraft(s, { ...s, steps: [s.steps[1]!, s.steps[0]!] })).toBe(false)
  })

  it('a blank line the person added counts, although Save would not send it', () => {
    const a = stored()
    const b = { ...a, lines: [...a.lines, { key: 'x', ingredientId: null, ingredientName: '', quantity: '', unit: '', optional: false, note: '' }] }
    expect(draftToInput(a)).toEqual(draftToInput(b)) // the premise: the body is the same
    expect(sameDraft(a, b)).toBe(false)
  })

  it('a new blank Step counts', () => {
    const a = stored()
    expect(sameDraft(a, { ...a, steps: [...a.steps, { key: 'n', text: '', kind: 'active', durationMinutes: '', leadTimeMinutes: '', after: [], uses: [], image: '' }] })).toBe(false)
  })

  it('an empty draft equals an empty draft with the main Course set only when both have it', () => {
    expect(sameDraft(emptyDraft(), emptyDraft())).toBe(true)
    expect(sameDraft(emptyDraft(), { ...emptyDraft(), courseIds: [1] })).toBe(false)
  })

  it('never reads the keys, the take-over answer or wholeMealSet (not what the person typed)', () => {
    const a = stored()
    expect(sameDraft(a, { ...a, takeOver: true, wholeMealSet: !a.wholeMealSet })).toBe(true)
  })
})

describe('rekeyDraft', () => {
  it('gives every line, Step and use a new key and changes nothing else', () => {
    const a = draftFromRecipe(recipe())
    const b = rekeyDraft(a)
    const keys = (d: RecipeDraft) => [...d.lines.map((l) => l.key), ...d.steps.map((s) => s.key), ...d.steps.flatMap((s) => s.uses.map((u) => u.key))]
    expect(keys(b).some((k) => keys(a).includes(k))).toBe(false)
    expect(new Set(keys(b)).size).toBe(keys(b).length)
    expect(draftToInput(b)).toEqual(draftToInput(a))
  })

  it('does not mutate its input', () => {
    const a = stored()
    const before = JSON.stringify(a)
    rekeyDraft(a)
    expect(JSON.stringify(a)).toBe(before)
  })
})

describe('removeLineWithUndo / restoreLine', () => {
  const base = (): RecipeDraft => ({ ...emptyDraft(), name: 'X', lines: [line('a', 'flour'), line('b', 'milk'), line('c', 'salt')] })

  it('removes the line and reports it with its index', () => {
    const { draft, removed } = removeLineWithUndo(base(), 'b')
    expect(draft.lines.map((l) => l.key)).toEqual(['a', 'c'])
    expect(removed).toEqual({ line: line('b', 'milk'), index: 1 })
  })

  it('restore puts it back at its index: the original draft again', () => {
    const { draft, removed } = removeLineWithUndo(base(), 'b')
    expect(restoreLine(draft, removed!)).toEqual(base())
  })

  it('restoring the first and the last line works', () => {
    for (const key of ['a', 'c']) {
      const { draft, removed } = removeLineWithUndo(base(), key)
      expect(restoreLine(draft, removed!)).toEqual(base())
    }
  })

  it('an index past the end is clamped (other lines were removed meanwhile)', () => {
    const { draft, removed } = removeLineWithUndo(base(), 'c')
    const shorter = { ...draft, lines: draft.lines.slice(0, 1) }
    expect(restoreLine(shorter, removed!).lines.map((l) => l.key)).toEqual(['a', 'c'])
  })

  it('an unknown key removes nothing and reports null', () => {
    const { draft, removed } = removeLineWithUndo(base(), 'zzz')
    expect(removed).toBeNull()
    expect(draft).toEqual(base())
  })

  it('does not mutate its input', () => {
    const d = base()
    const before = JSON.stringify(d)
    removeLineWithUndo(d, 'b')
    expect(JSON.stringify(d)).toBe(before)
  })
})
