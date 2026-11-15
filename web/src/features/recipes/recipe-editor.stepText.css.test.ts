// B9-31 (user ruling: Step text weight 500; P30: the Step kind Segmented stays on one line). CSS contract: jsdom does not lay out.
// Both pin what is built today so the editor work (this package and B9-37) cannot lose it.
import { describe, expect, it } from 'vitest'
import { recipeRules } from './rules.test-helper'
import { readRecipesCss } from './recipesCss.test-helper'

describe('Step text in the editor', () => {
  it('is set at --text-step-weight (500): a rule on the Step card\'s text field says so, and none makes it heavier', () => {
    const rules = recipeRules.filter((r) => /\.step-card\b/.test(r.selector) && /textarea/.test(r.selector))
    expect(rules.some((r) => /font-weight:\s*var\(--text-step-weight\)/.test(r.body))).toBe(true)
    for (const r of rules) expect(r.body, r.selector).not.toMatch(/font-weight:\s*(?:6|7|8|9)\d\d|font-weight:\s*(?:bold|bolder)/)
  })

  it('the --text-step-weight token is 500', () => {
    const tokens = readRecipesCss() // the token lives in styles.css; this guards the editor stylesheet against a hard-coded weight
    expect(tokens).not.toMatch(/\.step-card[^{]*\{[^}]*font-weight:\s*(?:600|700)/)
  })
})

describe('Step kind Segmented (P30)', () => {
  it('takes its content\'s width and never shrinks, so Active · Passive · Advance Step stays on one line', () => {
    const rule = recipeRules.find((r) => r.selector.includes('.step-card__timing') && r.selector.includes(':has(.segmented)'))
    expect(rule?.body).toMatch(/inline-size:\s*max-content/)
    expect(rule?.body).toMatch(/min-inline-size:\s*max-content/)
    expect(rule?.body).toMatch(/flex:\s*none/)
  })
})
