// Sort-drag: reordering the ingredient lines of a draft (docs/dev/design/sort-drag.md section 6).
import { describe, expect, it } from 'vitest'
import { emptyDraft, moveLine, type LineDraft, type RecipeDraft } from './draft'

const line = (key: string): LineDraft => ({ key, ingredientId: 7, ingredientName: key, quantity: '1', unit: 'g', optional: false, note: '' })
const draftOf = (...keys: string[]): RecipeDraft => ({ ...emptyDraft(), name: 'Aioli', lines: keys.map(line) })
const keys = (d: RecipeDraft) => d.lines.map((l) => l.key)

describe('moveLine', () => {
  it('moves a line down and up', () => {
    expect(keys(moveLine(draftOf('a', 'b', 'c'), 0, 2))).toEqual(['b', 'c', 'a'])
    expect(keys(moveLine(draftOf('a', 'b', 'c'), 2, 0))).toEqual(['c', 'a', 'b'])
    expect(keys(moveLine(draftOf('a', 'b', 'c'), 1, 2))).toEqual(['a', 'c', 'b'])
  })
  it('keeps the very same line objects and touches nothing else', () => {
    const d = { ...draftOf('a', 'b'), steps: [{ key: 's', text: 'x', kind: 'active' as const, durationMinutes: '', leadTimeMinutes: '', after: [], uses: [], image: '' }] }
    const out = moveLine(d, 0, 1)
    expect(out.lines[1]).toBe(d.lines[0])
    expect(out.steps).toBe(d.steps)
    expect(out.name).toBe('Aioli')
  })
  it('never mutates the draft', () => {
    const d = draftOf('a', 'b', 'c')
    moveLine(d, 0, 2)
    expect(keys(d)).toEqual(['a', 'b', 'c'])
  })
  it('leaves the lines as they are for no move or an index outside the list', () => {
    expect(keys(moveLine(draftOf('a', 'b'), 1, 1))).toEqual(['a', 'b'])
    expect(keys(moveLine(draftOf('a', 'b'), 5, 0))).toEqual(['a', 'b'])
    expect(keys(moveLine(draftOf('a', 'b'), -1, 0))).toEqual(['a', 'b'])
  })
  it('clamps a target past the end', () => {
    expect(keys(moveLine(draftOf('a', 'b', 'c'), 0, 9))).toEqual(['b', 'c', 'a'])
  })
})
