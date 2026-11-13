// hf-recipes-filter round 2: every user-facing string of the filter header lives in recipeStrings (docs/design/recipes-filter.md
// 9, 13); the filter library and the Tag search hook hold no copy of their own.
import { describe, expect, it } from 'vitest'
import { recipeStrings } from './strings'

const raw = import.meta.glob(['./lib/recipeFilters.ts', './hooks/useTagFilterSearch.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const code = (p: string) => (raw[p] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '')

describe('recipeStrings.filters', () => {
  const f = recipeStrings.filters as Record<string, unknown> & {
    removeCourse: (n: string) => string
    removeTag: (n: string) => string
    buttonLabel: (n: number) => string
    noTagMatch: (q: string) => string
  }
  it('names the remove buttons of the chips', () => {
    expect(f.removeCourse('Main')).toBe('Remove Course: Main')
    expect(f.removeTag('fish')).toBe('Remove Tag: fish')
  })
  it('names the Filters button with its count', () => {
    expect(f.buttonLabel(0)).toBe('Filters')
    expect(f.buttonLabel(1)).toBe('Filters, 1 active')
    expect(f.buttonLabel(2)).toBe('Filters, 2 active')
  })
  it('says when no Tag matches, and when there is none', () => {
    expect(f.noTagMatch('zzz')).toBe("No Tag matches 'zzz'")
    expect(f.noTags).toBe('No Tag to choose from')
  })
  it('has the Tag search label (also its placeholder) and the footer button', () => {
    expect(f.tagSearch).toBe('Search Tags')
    expect(f.showRecipes).toBe('Show Recipes')
  })
  it('never says "Done" (a GLOSSARY _Avoid_ word) or "Close" (the sheet\'s ✕)', () => {
    for (const value of Object.values(f)) if (typeof value === 'string') expect(value).not.toMatch(/^(Done|Close)$/)
  })
})

describe('no literal copy outside recipeStrings', () => {
  it.each(['./lib/recipeFilters.ts', './hooks/useTagFilterSearch.ts'])('%s imports its words from recipeStrings', (p) => {
    const text = code(p)
    expect(text, p).not.toBe('')
    const literals = text.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? []
    for (const literal of literals) {
      expect(literal, p).not.toMatch(/Remove|Filters|active|No Tag|matches|choose/)
    }
  })
})
