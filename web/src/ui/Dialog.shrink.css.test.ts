// SF1 defect 4: a Dialog body is a grid item and grew to its widest child; only the exclusions list had a scoped workaround.
import { describe, expect, it } from 'vitest'
import { readSource } from '../features/plan/test-css'
import { declarations, readUiCss } from './test-utils'

describe('Dialog body shrinks (SF1)', () => {
  it('.dialog__body sets min-inline-size: 0 in the shared Dialog.css', () => {
    expect(declarations(readUiCss('Dialog.css'), '.dialog__body')['min-inline-size']).toBe('0')
  })

  it('recipe-detail.css (which holds .ingredient-exclusions since the WP-RX-0 split) carries no scoped .dialog__body:has(> .ingredient-exclusions) workaround', () => {
    const raw = readSource('features/recipes/recipe-detail.css')
    expect(raw).toContain('.ingredient-exclusions') // the sheet exists and holds the rule, so the next line tests something
    const sheet = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(sheet).not.toContain('.dialog__body')
  })
})
