// B5-BOW: the Bought line styles live in plan.css (no separate bought.css).
import { describe, expect, it } from 'vitest'
import { readFeatureCss, readSource } from './test-css'

const css = readFeatureCss('plan.css')

describe('Bought styles are in plan.css', () => {
  it('holds .bought-line and the warn-toned .rule-warning-line', () => {
    expect(css).toMatch(/\.bought-line\s*\{/)
    expect(css).toMatch(/\.rule-warning-line\s*\{[^}]*var\(--status-spoil-fg\)/)
  })
  it('no bought.css is left, and nothing imports it', () => {
    expect(readSource('features/plan/components/bought.css')).toBe('')
    for (const f of ['BoughtLine', 'RuleWarningLine']) expect(readSource(`features/plan/components/${f}.tsx`)).not.toMatch(/bought\.css/)
  })
})
