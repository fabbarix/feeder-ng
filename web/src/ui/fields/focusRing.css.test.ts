// R2-F (F-09 ring part, K1 (b), (d)): one --focus-ring token for every field control, replacing the double ring (border colour +
// 3 px pale halo). The ring is a box-shadow of 2 px in --color-accent; contrast >= 3:1 (WCAG 1.4.11) against the sheet surface,
// the control fill and the page in light and dark, computed with the project's helper.
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../theme/contrast'
import { GOLDEN_PALETTES } from '../../theme/palette.golden'
import { declarations, readStylesCss, readUiCss } from '../test-utils'

const styles = readStylesCss()
const field = readUiCss('fields/Field.css')
const search = readUiCss('fields/SearchField.css')
const select = readUiCss('Select/Select.css')
const date = readUiCss('fields/DateField.css')
const time = readUiCss('fields/TimeField.css')

/** Token map of the first rule whose selector line contains `marker` (light: ":root,\n[data-scheme='light']", dark: ":root[data-scheme='dark']"). */
function tokens(marker: RegExp): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of styles.matchAll(/(^|\n)((?::root|\[data-scheme)[^{]*)\{([^}]*)\}/g)) {
    if (!marker.test(m[2]!)) continue
    for (const d of m[3]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim()
  }
  return out
}
const light = { ...tokens(/data-scheme='light'/) }
const dark = { ...light, ...tokens(/^:root\[data-scheme='dark'\]/) }

describe('--focus-ring token', () => {
  it('is defined once in styles.css as a 2 px accent box-shadow ring', () => {
    const defs = [...styles.matchAll(/--focus-ring\s*:\s*([^;]+);/g)].map((m) => m[1]!.trim())
    expect(defs, 'one definition').toHaveLength(1)
    expect(defs[0]).toBe('0 0 0 2px var(--color-accent)')
  })
})

const RING_SELECTORS: [string, string, string][] = [
  ['TextField, NumberField, DateField control', field, '.ui-field__control:focus-within'],
  ['SearchField', search, '.search-field__control:focus-within'],
  ['Select trigger', select, '.select__trigger:focus-visible'],
  ['DateField trigger', date, '.date-field__trigger:focus-visible'],
  ['TimeField group', time, '.time-field:focus-within'],
]

describe.each(RING_SELECTORS)('%s focus', (_name, css, selector) => {
  it('uses box-shadow: var(--focus-ring) and the accent border colour', () => {
    const d = declarations(css, selector)
    expect(d['box-shadow']).toBe('var(--focus-ring)')
    expect(d['border-color'] ?? 'var(--color-accent)').toBe('var(--color-accent)')
  })

  it('has no second ring: no outline other than none, no pale soft-strong halo', () => {
    const d = declarations(css, selector)
    expect(d['outline'] ?? 'none').toMatch(/^none$/)
    expect(JSON.stringify(d)).not.toMatch(/soft-strong/)
  })
})

describe('focus ring on the other field parts', () => {
  it('the inner inputs draw nothing of their own (focus is the control level)', () => {
    expect(declarations(field, '.ui-field__input')['outline']).toBe('none')
    expect(declarations(search, '.search-field__input')['outline']).toBe('none')
  })

  it('the TimeField segment shows only a soft-strong fill (visible against surface-2) on focus, no outline of its own (K1 (b))', () => {
    const d = declarations(time, '.time-field__segment:focus-visible')
    expect(d['background']).toBe('var(--color-soft-strong)')
    expect(d['outline'] ?? 'none').toBe('none')
    expect(d['box-shadow'] ?? 'none').toBe('none')
  })

  it('the TimeField group gets the same border and radius as the other controls', () => {
    expect(declarations(time, '.time-field')).toMatchObject({ border: 'var(--field-border-width) solid var(--color-outline)', 'border-radius': 'var(--radius-control)' })
  })

  it('an invalid field keeps the danger border while focused (error colour wins over the accent border)', () => {
    expect(declarations(field, ".ui-field[data-invalid] .ui-field__control:focus-within")['border-color']).toBe('var(--status-danger-fg)')
  })
})

describe('ring contrast, WCAG 1.4.11 non-text >= 3:1, every golden palette', () => {
  const cases = Object.entries(GOLDEN_PALETTES).flatMap(([preset]) =>
    (['light', 'dark'] as const).flatMap((scheme) => (['surface', 'surface2', 'surface3', 'bg'] as const).map((surface) => [preset, scheme, surface] as const)),
  )
  it.each(cases)('%s %s: ring vs %s', (preset, scheme, surface) => {
    const p = GOLDEN_PALETTES[preset as keyof typeof GOLDEN_PALETTES][scheme]
    expect(contrastRatio(p.accent, p[surface]), `${preset} ${scheme} ${surface}`).toBeGreaterThanOrEqual(3)
  })

  it('the default scheme tokens in styles.css resolve to hex (the token maps are readable)', () => {
    expect(light['--color-accent']).toMatch(/^#/)
    expect(dark['--color-accent']).toMatch(/^#/)
  })

  it('the ring colour is the accent token itself (a change of accent re-runs this check)', () => {
    const token = styles.match(/--focus-ring\s*:\s*([^;]+);/)?.[1] ?? ''
    expect(token).toContain('var(--color-accent)')
  })
})
