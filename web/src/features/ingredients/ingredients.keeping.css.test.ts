// B9-48 (SET-05): the CSS contract of the Keeping tile (jsdom does not lay out; the page-layout scenarios ingredient-keeping and
// supply-keeping measure the real thing). Rules per the chapter: label body-strong, hint meta and muted, rows separated by 1 px
// --color-line, the value at least --row-value-min wide, spacing from tokens only. The mock's classes: .kp, .kp-row, .kp-row__text,
// .kp-row__label, .kp-row__hint, .kp-row__ctrl, .kp-value, .kp-actions (docs/design/ui-review-3/mocks/set-05-ingredient.html).
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const css = readSource('features/ingredients/ingredients.css').replace(/\/\*[\s\S]*?\*\//g, '')
const bodies = (part: string) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, selector]) => selector!.split(',').some((s) => s.trim() === part || s.trim().startsWith(`${part}:`) || s.trim().startsWith(`${part}[`))).map(([, , body]) => body!)
const rule = (part: string) => bodies(part).join(' ')

describe('ingredients.css: Keeping rows (SET-05)', () => {
  it('has the row classes', () => {
    for (const c of ['.kp-row', '.kp-row__label', '.kp-row__hint', '.kp-row__ctrl', '.kp-value']) expect(css, c).toContain(c)
  })
  it('a row is the text at the start and the control at the end', () => {
    expect(rule('.kp-row')).toMatch(/display:\s*(flex|grid)/)
    expect(rule('.kp-row')).toMatch(/justify-content:\s*space-between|grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/)
  })
  it('rows are separated by a 1 px --color-line rule', () => {
    expect(css).toMatch(/\.kp-row[^{]*\{[^}]*border-(block|top|bottom)[a-z-]*:\s*1px solid var\(--color-line\)/)
  })
  it('the label is body-strong; the hint is meta and muted', () => {
    expect(rule('.kp-row__label')).toMatch(/font-size:\s*var\(--text-body-strong-size\)/)
    expect(rule('.kp-row__hint')).toMatch(/font-size:\s*var\(--text-meta-size\)/)
    expect(rule('.kp-row__hint')).toMatch(/color:\s*var\(--color-muted\)/)
  })
  it('the value has a minimum width of --row-value-min', () => {
    expect(rule('.kp-value')).toMatch(/min-inline-size:\s*var\(--row-value-min\)/)
  })
  it('the text may shrink and wrap so a long hint never pushes the control out (min-inline-size 0)', () => {
    expect(rule('.kp-row__text')).toMatch(/min-inline-size:\s*0/)
  })
  it('uses spacing tokens only', () => {
    for (const part of ['.kp', '.kp-row', '.kp-row__text', '.kp-row__ctrl', '.kp-actions']) {
      for (const body of bodies(part)) expect(body, part).not.toMatch(/(gap|margin[a-z-]*|padding[a-z-]*):\s*[^;]*\d+px/)
    }
  })
  it('keeps the container query that stacks the half-width tiles below 34 rem (user ruling: keep)', () => {
    expect(css).toMatch(/@container ingredient-tiles \(width < 34rem\)\s*\{\s*\.ingredient__tile\s*\{\s*grid-column:\s*1\s*\/\s*-1/)
  })
})
