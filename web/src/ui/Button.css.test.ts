// B9-01 / DS-12 R-A (buttons look like buttons): the CSS contract of Button.css, read as text (vitest blanks CSS imports).
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss, ruleBlocks } from './test-utils'

const css = readUiCss('Button.css')
const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ')
const BOUNDARY = 'inset 0 0 0 1px var(--color-outline)'

/** Rule bodies whose selector list has an entry matching `test`. */
const bodiesFor = (test: (selector: string) => boolean) =>
  ruleBlocks(css)
    .filter((r) => r.selectors.some((s) => test(norm(s))))
    .map((r) => norm(r.body))

describe('Button.css variants (DS-12 R-A)', () => {
  it('secondary: a surface fill, text colour and a 1 px outline boundary', () => {
    const d = declarations(css, ".button[data-variant='secondary']")
    expect(d['background']).toBe('var(--color-surface)')
    expect(d['color']).toBe('var(--color-text)')
    expect(d['box-shadow']).toBe(BOUNDARY)
  })

  it('secondary on a soft tile and on the dark hero: the boundary is accent-text', () => {
    const d = declarations(css, ".tile[data-variant='soft'] .button[data-variant='secondary']")
    expect(d['box-shadow']).toBe('inset 0 0 0 1px var(--color-accent-text)')
    const dark = declarations(css, "[data-scheme='dark'] .tile[data-variant='hero'] .button[data-variant='secondary']")
    expect(dark['box-shadow']).toBe('inset 0 0 0 1px var(--color-accent-text)')
  })

  it('danger-secondary: surface fill, danger fg text and boundary', () => {
    const d = declarations(css, ".button[data-variant='danger-secondary']")
    expect(d['background']).toBe('var(--color-surface)')
    expect(d['color']).toBe('var(--status-danger-fg)')
    expect(d['box-shadow']).toBe('inset 0 0 0 1px var(--status-danger-fg)')
  })

  it('link: no box, underlined, accent-text (a link in running text only)', () => {
    const d = declarations(css, ".button[data-variant='link']")
    expect(d['background']).toMatch(/^(none|transparent)$/)
    expect(d['padding']).toBe('0')
    expect(d['min-block-size']).toBe('auto')
    expect(d['color']).toBe('var(--color-accent-text)')
    expect(d['text-decoration']).toBe('underline')
  })

  it.each(['tertiary', 'danger-tertiary', 'accent-secondary'])('no rule styles the removed variant %s', (v) => {
    expect(css).not.toContain(`'${v}'`)
    expect(css).not.toContain(`"${v}"`)
  })

  it.each(["secondary'", "danger-secondary'"])('hover and pressed layer over the boundary, never replace it (%s)', (v) => {
    const sel = `.button[data-variant='${v}`
    for (const state of [':hover', ':active']) {
      const bodies = bodiesFor((s) => s.startsWith(sel + ']') && s.includes(state))
      expect(bodies.length, `${sel}] ${state}`).toBeGreaterThan(0)
      const shadow = bodies.join(' ')
      expect(shadow).toMatch(/box-shadow:\s*inset 0 0 0 1px [^,]+,\s*inset 0 0 0 999px/)
    }
  })
})

describe('Button.css one line and the narrow icon (DS-12 Segmented, DS-03)', () => {
  it("a [data-one-line] Button never wraps its label (P30)", () => {
    const d = declarations(css, '.button[data-one-line]')
    expect(d['white-space']).toBe('nowrap')
  })

  it('iconOnly="narrow" hides the label inside the narrow band and keeps the box square', () => {
    const rules = bodiesFor((s) => s.includes("[data-icon-only='narrow']"))
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.join(' ')).toMatch(/display:\s*none|clip|inline-size/)
  })
})
