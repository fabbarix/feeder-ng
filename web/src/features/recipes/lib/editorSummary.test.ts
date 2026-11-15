// B9-37 (RX-02, decision RX 5): a closed Disclosure says what it holds in one line. The wording is pinned here; the screen tests check it shows.
// Where the chapter's text and its mock differ (the mock lists four Tags and one override), the chapter's text wins: up to three Tags then "+N";
// one override by name, several as a count.
import { describe, expect, it } from 'vitest'
import { courseChoices } from '../fixtures.test-helper'
import { emptyDraft, type RecipeDraft } from './draft'
import { aboutSummary, planningSummary } from './editorSummary'

describe('aboutSummary ("Description and source")', () => {
  it('is "Optional" when there is neither a description nor a source', () => {
    expect(aboutSummary({ description: '', sourceUrl: '' })).toBe('Optional')
    expect(aboutSummary({ description: '   ', sourceUrl: ' ' })).toBe('Optional')
  })

  it('a short description is shown whole, then the Source host after a middle dot', () => {
    expect(aboutSummary({ description: 'A quick weeknight sauce.', sourceUrl: 'https://example.test/recipes/pasta' })).toBe('A quick weeknight sauce. · example.test')
  })

  it('cuts the description at 60 characters with an ellipsis, never mid-run of spaces', () => {
    const long = 'A quick weeknight tomato sauce with garlic and basil. Make the sauce ahead on Sunday.'
    const out = aboutSummary({ description: long, sourceUrl: '' })
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(61)
    expect(long.startsWith(out.slice(0, -1).trimEnd())).toBe(true)
  })

  it('a description of exactly 60 characters is not cut', () => {
    const sixty = 'x'.repeat(60)
    expect(aboutSummary({ description: sixty, sourceUrl: '' })).toBe(sixty)
  })

  it('collapses line breaks and runs of spaces to single spaces', () => {
    expect(aboutSummary({ description: 'One\n\ntwo   three', sourceUrl: '' })).toBe('One two three')
  })

  it('only a source: the host alone; "www." is dropped; a link that is not a URL is left out', () => {
    expect(aboutSummary({ description: '', sourceUrl: 'https://www.example.test/a/b?c=d' })).toBe('example.test')
    expect(aboutSummary({ description: '', sourceUrl: 'not a url' })).toBe('Optional')
    expect(aboutSummary({ description: 'Nice.', sourceUrl: 'not a url' })).toBe('Nice.')
  })
})

describe('planningSummary ("Planning")', () => {
  const d = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({ ...emptyDraft(), courseIds: [1], ...over })

  it('Courses, then Tags, joined by a middle dot', () => {
    expect(planningSummary(d({ tags: ['quick', 'family'] }), courseChoices)).toBe('Main · quick, family')
  })

  it('Courses are named in household order whatever order the draft holds them in', () => {
    expect(planningSummary(d({ courseIds: [3, 1] }), courseChoices)).toBe('Main, Starter')
  })

  it('shows up to three Tags and counts the rest: "+1"', () => {
    expect(planningSummary(d({ tags: ['quick', 'family', 'pasta', 'weeknight'] }), courseChoices)).toBe('Main · quick, family, pasta +1')
    expect(planningSummary(d({ tags: ['a', 'b', 'c', 'd', 'e'] }), courseChoices)).toBe('Main · a, b, c +2')
    expect(planningSummary(d({ tags: ['a', 'b', 'c'] }), courseChoices)).toBe('Main · a, b, c')
  })

  it('one override is named with its value; two or more are counted', () => {
    expect(planningSummary(d({ cooldownDays: '5' }), courseChoices)).toBe('Main · Cool-down 5 days')
    expect(planningSummary(d({ leftoverUseByDays: '1' }), courseChoices)).toBe('Main · Leftover Use-by 1 day')
    expect(planningSummary(d({ reheatMinutes: '4' }), courseChoices)).toBe('Main · Reheat time 4 min')
    expect(planningSummary(d({ frozenUseByDays: '60' }), courseChoices)).toBe('Main · Frozen Use-by 60 days')
    expect(planningSummary(d({ cooldownDays: '5', reheatMinutes: '4' }), courseChoices)).toBe('Main · 2 overrides')
    expect(planningSummary(d({ cooldownDays: '5', leftoverUseByDays: '3', reheatMinutes: '4', frozenUseByDays: '60' }), courseChoices)).toBe('Main · 4 overrides')
  })

  it('a blank override is not an override', () => {
    expect(planningSummary(d({ cooldownDays: ' ' }), courseChoices)).toBe('Main')
  })

  it('all three parts together', () => {
    expect(planningSummary(d({ tags: ['quick', 'family', 'pasta', 'weeknight'], cooldownDays: '5' }), courseChoices)).toBe('Main · quick, family, pasta +1 · Cool-down 5 days')
  })

  it('says it uses the Household settings when nothing is set', () => {
    expect(planningSummary(d({ courseIds: [] }), courseChoices)).toBe('Household defaults')
  })

  it('a Base recipe is never planned: "Never planned", then its Tags', () => {
    expect(planningSummary(d({ baseRecipe: true, yieldUnit: 'g', courseIds: [], tags: ['sauce', 'basics'] }), courseChoices)).toBe('Never planned · sauce, basics')
    expect(planningSummary(d({ baseRecipe: true, yieldUnit: 'g', courseIds: [] }), courseChoices)).toBe('Never planned')
  })
})
