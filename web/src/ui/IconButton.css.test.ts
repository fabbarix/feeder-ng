// B9-01 / DS-12 R-A: the IconButton has the same boundary as a secondary Button, a surface fill on a tint, and a circle shape.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss, ruleBlocks } from './test-utils'

const css = readUiCss('IconButton.css')
const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ')

describe('IconButton.css (DS-12 R-A)', () => {
  it('has the 1 px outline boundary and the surface-2 fill on a surface', () => {
    const d = declarations(css, '.icon-button')
    expect(d['box-shadow']).toBe('inset 0 0 0 1px var(--color-outline)')
    expect(d['background']).toBe('var(--color-surface-2)')
  })

  it('on a soft tile, a status tile or the hero the fill is --color-surface and the boundary is accent-text on soft', () => {
    const rules = ruleBlocks(css).filter((r) => r.selectors.some((s) => /\.tile\[data-variant='(soft|status|hero)'\] \.icon-button/.test(norm(s))))
    expect(rules.length).toBeGreaterThan(0)
    const body = rules.map((r) => norm(r.body)).join(' ')
    expect(body).toContain('background: var(--color-surface)')
    const soft = declarations(css, ".tile[data-variant='soft'] .icon-button")
    expect(soft['box-shadow']).toBe('inset 0 0 0 1px var(--color-accent-text)')
  })

  it('shape="circle" is a round button', () => {
    expect(declarations(css, ".icon-button[data-shape='circle']")['border-radius']).toMatch(/50%|999|pill|full/)
  })

  it('hover and pressed layer over the boundary', () => {
    for (const state of [':hover', ':active']) {
      const bodies = ruleBlocks(css)
        .filter((r) => r.selectors.some((s) => norm(s).startsWith('.icon-button' + state)))
        .map((r) => norm(r.body))
        .join(' ')
      expect(bodies).toMatch(/box-shadow:\s*inset 0 0 0 1px [^,]+,\s*inset 0 0 0 999px/)
    }
  })
})
