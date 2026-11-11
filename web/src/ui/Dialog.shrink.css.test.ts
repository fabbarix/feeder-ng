// SF1 defect 4: a Dialog body is a grid item and grew to its widest child; only the exclusions list had a scoped workaround.
import { describe, expect, it } from 'vitest'
import { readSource } from '../features/plan/test-css'
import { declarations, readUiCss } from './test-utils'

describe('Dialog body shrinks (SF1)', () => {
  it('.dialog__body sets min-inline-size: 0 in the shared Dialog.css', () => {
    expect(declarations(readUiCss('Dialog.css'), '.dialog__body')['min-inline-size']).toBe('0')
  })

  it('recipes.css no longer carries the scoped .dialog__body:has(> .ingredient-exclusions) workaround', () => {
    const recipes = readSource('features/recipes/recipes.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(recipes).not.toContain('.dialog__body')
  })
})
