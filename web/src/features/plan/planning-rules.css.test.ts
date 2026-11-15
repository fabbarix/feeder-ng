// B9-51 review: a Slot Rule's "Recipe: …" and a Variety Rule's limits are the rule itself; at 375 to 430 px they were cut with an
// ellipsis. jsdom does not lay out, so this pins the CSS: the rule rows' detail wraps at a word, never ends in an ellipsis.
import { describe, expect, it } from 'vitest'
import { readSource } from './test-css'

const css = readSource('features/plan/planning-rules.css').replace(/\/\*[\s\S]*?\*\//g, '')
const editors = readSource('features/plan/components/RulesEditors.tsx')

describe('planning-rules.css: a rule row\'s detail is never cut', () => {
  it('both editors scope their rows with .planning-rules__editor', () => {
    expect(editors.match(/className="plan__stack planning-rules__editor"/g)).toHaveLength(2)
  })
  it('the meta and its text wrap, with no ellipsis and no mid-word break', () => {
    const m = /\.planning-rules__editor \.list-row__meta,\s*\.planning-rules__editor \.list-row__meta-text\s*\{([^}]*)\}/.exec(css)
    expect(m?.[1]).toMatch(/white-space:\s*normal/)
    expect(m?.[1]).toMatch(/text-overflow:\s*clip/)
    expect(css).not.toMatch(/overflow-wrap:\s*(anywhere|break-word)|word-break:\s*break-(all|word)/)
  })
})
