// WP-RX-0 (B9-10): features/recipes/strings.ts is split into strings/{list,detail,editor}.ts and keeps re-exporting, so no import breaks
// and a later package edits one area module. Contract: each module exports one object; their keys are disjoint; together they are exactly
// the keys recipeStrings had before the split, with the same values; strings.ts holds no string bodies of its own.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'
import { codeMessage, courseStrings, recipeStrings } from './strings'
import { recipeListStrings } from './strings/list'
import { recipeDetailStrings } from './strings/detail'
import { recipeEditorStrings } from './strings/editor'

// The top-level keys of recipeStrings at the start of B9-10 (nothing may be lost or renamed by the split).
const KEYS = [
  'units', 'title', 'newRecipe', 'editRecipe', 'search', 'allTags', 'sort', 'filters', 'cookedLabel', 'tagsLabel', 'newTag', 'moreTags', 'showArchived', 'empty',
  'loading', 'loadError', 'listError', 'totalTime', 'noSteps', 'advanceChip', 'advanceWord', 'yieldLabel', 'readyMeal', 'archived', 'archive',
  'unarchive', 'delete', 'deleteDialog', 'inUse', 'baseRecipe', 'more', 'portionsPerBatch', 'totalMetric', 'aheadMetric', 'cook', 'overflow', 'deleteBlocked',
  'edit', 'save', 'saving', 'cancel', 'ingredients', 'stepsTitle', 'photo', 'optional', 'sections', 'editorActions', 'favourite', 'dislike', 'exclusion',
  'preferences', 'preferencesFor', 'preferencesLoadError', 'memberColumn', 'you', 'noMembers', 'addMembers', 'askAdmin', 'viaNote', 'excludedVia', 'via',
  'alsoVia', 'stateToggle', 'saveFailed', 'exclusionSaveFailed', 'members', 'excludesToggle', 'unitConversion', 'fields', 'lines', 'quickCreate',
  'readyMealIngredient', 'steps', 'generic', 'checkFields', 'codes',
  // B9-20 (RES-02): the seven-state copy. 'noMatch' ("No Recipe matches.") became noMatchFor / noMatchFilters.
  'emptyText', 'importRecipes', 'noMatchFor', 'noMatchFilters', 'noMatchText', 'showAll', 'offlineUnknownTitle', 'offlineUnknownText',
  'detailOfflineTitle', 'detailOfflineText',
]

const parts = { list: recipeListStrings, detail: recipeDetailStrings, editor: recipeEditorStrings } as Record<string, Record<string, unknown>>
const all = recipeStrings as unknown as Record<string, unknown>

describe('recipes strings split (WP-RX-0)', () => {
  it('recipeStrings still has every key it had', () => {
    expect(Object.keys(all).sort()).toEqual([...KEYS].sort())
  })
  it('the three modules each hold keys, and no key is in two of them', () => {
    const seen = new Map<string, string>()
    for (const [name, part] of Object.entries(parts)) {
      expect(Object.keys(part).length, name).toBeGreaterThan(0)
      for (const k of Object.keys(part)) {
        expect(seen.get(k), `${k} is in ${seen.get(k)} and ${name}`).toBeUndefined()
        seen.set(k, name)
      }
    }
  })
  it('together they are recipeStrings: same keys, same values (not copies that can drift)', () => {
    const union: Record<string, unknown> = Object.assign({}, ...Object.values(parts))
    expect(Object.keys(union).sort()).toEqual([...KEYS].sort())
    for (const k of KEYS) expect(all[k], k).toBe(union[k])
  })
  it('each area keeps what it is about: the list has its filters and empty state, the detail its metrics and preferences, the editor its quick-create and lines', () => {
    for (const k of ['filters', 'empty', 'search']) expect(parts.list, `list.${k}`).toHaveProperty(k)
    for (const k of ['totalMetric', 'preferences', 'stepsTitle']) expect(parts.detail, `detail.${k}`).toHaveProperty(k)
    for (const k of ['quickCreate', 'lines', 'steps']) expect(parts.editor, `editor.${k}`).toHaveProperty(k)
  })
  it('strings.ts still exports courseStrings and codeMessage, and is a thin file (no string bodies)', () => {
    expect(courseStrings).toBeDefined()
    expect(typeof codeMessage('anything')).toBe('string')
    expect(readSource('features/recipes/strings.ts').split('\n').length).toBeLessThanOrEqual(40)
  })
})
