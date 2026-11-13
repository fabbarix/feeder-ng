// BR-H (docs/dev/design/base-recipes.md section 9): what Cook Mode says about the Steps a Base recipe brings. Pure functions.
// Pinned API of lib/baseSteps.ts:
//   baseChipText(label)            "Béchamel", "Béchamel · Roux" (the path joined with " · "; the name when the path is empty)
//   readyBefore(items)             per item (same length, same order): the Base recipes that are ready by that item, as names
//   coveredLines(covered)          one line per covered Base recipe, in order: "Béchamel from the Pantry"
import { describe, expect, it } from 'vitest'
import { BAKE, BECHAMEL, FROLLA, LAYER, MELT, ROUX, SIMMER, baseItem } from '../base-fixtures'
import { baseChipText, coveredLines, readyBefore } from './baseSteps'

describe('baseChipText', () => {
  it('names the Base recipe', () => {
    expect(baseChipText(BECHAMEL)).toBe('Béchamel')
  })
  it('names a nested one by its whole path, outermost first', () => {
    expect(baseChipText(ROUX)).toBe('Béchamel · Roux')
  })
  it('falls back to the name when the path is missing or empty', () => {
    expect(baseChipText({ id: 9, name: 'Stock', path: [] })).toBe('Stock')
  })
})

describe('readyBefore', () => {
  it('marks the first Step after the Base recipe\'s block, and no other', () => {
    expect(readyBefore([MELT, SIMMER, LAYER, BAKE])).toEqual([[], [], ['Béchamel'], []])
  })

  it('has one entry per item, all empty for a Recipe without Base recipes', () => {
    expect(readyBefore([LAYER, BAKE])).toEqual([[], []])
    expect(readyBefore([])).toEqual([])
  })

  it('a block that is the last thing in the list is never ready before anything', () => {
    expect(readyBefore([LAYER, MELT, SIMMER])).toEqual([[], [], []])
  })

  it('treats a missing baseRecipe (an older payload) as the Recipe\'s own Step', () => {
    const old = { courseId: 1 }
    expect(readyBefore([old, old])).toEqual([[], []])
  })

  it('a nested block is one block: Roux inside Béchamel does not end it, and only the outermost is ready', () => {
    const whisk = baseItem({ step: 0, number: 1, text: 'Cook the roux', baseRecipe: ROUX })
    const simmer = baseItem({ step: 1, number: 2, text: 'Simmer the sauce', baseRecipe: BECHAMEL })
    const rest = baseItem({ step: 2, number: 3, text: 'Rest the roux', baseRecipe: ROUX })
    expect(readyBefore([whisk, simmer, rest, LAYER])).toEqual([[], [], [], ['Béchamel']])
  })

  it('the ready mark goes on the next Step of the Recipe itself, so two Base recipes in a row are both ready there, in the order their blocks ended', () => {
    const dough = baseItem({ step: 4, number: 3, text: 'Knead the dough', baseRecipe: FROLLA })
    expect(readyBefore([MELT, SIMMER, dough, LAYER])).toEqual([[], [], [], ['Béchamel', 'Pasta frolla']])
    expect(readyBefore([dough, MELT, SIMMER, LAYER])).toEqual([[], [], [], ['Pasta frolla', 'Béchamel']])
  })

  it('the same Base recipe used twice, with a Step of the Recipe itself between, is ready twice', () => {
    const again = [MELT, SIMMER, LAYER, { ...MELT, step: 6, number: 4 }, { ...SIMMER, step: 7, number: 5 }, BAKE]
    expect(readyBefore(again)).toEqual([[], [], ['Béchamel'], [], [], ['Béchamel']])
  })

  it('looks at the Course of the block: another Course\'s item in between is not the Step that uses it', () => {
    const side = (n: number) => baseItem({ courseId: 2, step: n, number: n + 1, text: `Side ${n}` })
    // Main: Melt, Simmer, Layer. Side: two items between them. Ready is shown on Main's Layer, not on the Side's item.
    const timeline = [MELT, side(0), SIMMER, side(1), LAYER, BAKE]
    expect(readyBefore(timeline)).toEqual([[], [], [], [], ['Béchamel'], []])
  })

  it('a Course filter that leaves only some of the items is read as given (the shown list decides)', () => {
    expect(readyBefore([SIMMER, LAYER])).toEqual([[], ['Béchamel']])
  })

  it('does not mutate its input', () => {
    const items = Object.freeze([MELT, SIMMER, LAYER])
    expect(() => readyBefore(items)).not.toThrow()
  })
})

describe('coveredLines', () => {
  it('says each covered Base recipe comes from the Pantry, in order', () => {
    expect(coveredLines([BECHAMEL, FROLLA])).toEqual(['Béchamel from the Pantry', 'Pasta frolla from the Pantry'])
  })
  it('uses the outermost name of a path (covered names only the outermost, but a path is joined if it is longer)', () => {
    expect(coveredLines([ROUX])).toEqual(['Béchamel · Roux from the Pantry'])
  })
  it('is empty when nothing is covered, or the payload has no covered (older)', () => {
    expect(coveredLines([])).toEqual([])
    expect(coveredLines(undefined)).toEqual([])
  })
})
