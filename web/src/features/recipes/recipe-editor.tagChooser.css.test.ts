// B9-37 (RX-09, replaces DS-04's `.tag-input` pins, which go with the TagInput): the Tag field of Planning is `.tag-chooser`; its chips
// wrap in `.tag-chooser__chips`, and a 36-character Tag chip never runs past the field at 375 (scenario recipe-editor-long-tag measures it).
// A Chip already caps itself at 100 % of its line and ellipsises its label (ui/Chip.css); the field must therefore give it a definite line.
import { describe, expect, it } from 'vitest'
import { cssRules } from './rules.test-helper'
import { recipesCssPaths } from './recipesCss.test-helper'

const all = cssRules(recipesCssPaths())
const merged = (selector: string) => Object.assign({}, ...all.rulesFor(selector).filter((r) => r.minWidth === 0).map((r) => Object.fromEntries(r.body.split(';').map((d) => d.split(/:(.*)/s).map((x) => x.trim())).filter((p) => p[0]))))

describe('DS-04 for the Tag chooser: a Tag chip never runs past the Tag field', () => {
  it('.tag-chooser has a definite track (minmax(0, 1fr)) or shrinks to its column (min-inline-size: 0)', () => {
    const r = merged('.tag-chooser')
    expect(r['grid-template-columns'] === 'minmax(0, 1fr)' || r['min-inline-size'] === '0', JSON.stringify(r)).toBe(true)
  })

  it('.tag-chooser__chips is a wrapping row that may shrink', () => {
    const r = merged('.tag-chooser__chips')
    expect(r['display']).toMatch(/flex|inline-flex/)
    expect(r['flex-wrap']).toBe('wrap')
    expect(r['min-inline-size']).toBe('0')
  })

  it('the old inline-field rules are gone with the TagInput', () => {
    expect(all.rulesFor('.tag-input')).toEqual([])
    expect(all.rulesFor('.tag-input__suggestions')).toEqual([])
  })

  it('nothing fixes a width of 320px on the field (the 375 px column is narrower than it)', () => {
    const body = [...all.rulesFor('.tag-chooser'), ...all.rulesFor('.tag-chooser__chips')].map((r) => r.body).join(';')
    expect(body).not.toMatch(/320px/)
  })
})
