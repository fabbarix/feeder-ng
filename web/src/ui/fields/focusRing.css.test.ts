// R2-F (F-09 ring part, K1 (b), (d)), redone by B9-07 (A11Y-02): one ring for every field control, an OUTLINE (never a box-shadow, so forced
// colours keep it) in --focus-ring-color, drawn on the frame while the text entry inside it has focus. The ring is the accent;
// contrast >= 3:1 (WCAG 1.4.11) against the sheet surface, the control fill and the page in light and dark, computed with the project's helper.
// The old `--focus-ring` box-shadow token is gone (ui/focusLayer.css.test.ts holds the layer-wide rules; this file holds the fields').
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
const stepper = readUiCss('Stepper.css')
const weekday = readUiCss('WeekdayPicker/WeekdayPicker.css')
const keypad = readUiCss('PriceKeypad.css')

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

describe('the ring tokens (A11Y-02)', () => {
  it('--focus-ring (the 2 px box-shadow) is no longer defined; the outline is --focus-ring-width in --focus-ring-color', () => {
    expect(styles).not.toMatch(/--focus-ring\s*:/)
    expect(styles).toMatch(/--focus-ring-width:\s*3px/)
    expect(styles).toMatch(/--focus-ring-color:\s*var\(--color-accent\)/)
  })
  it('no field stylesheet draws a ring with box-shadow: var(--focus-ring), and none has a :focus-within ring on a frame', () => {
    for (const [name, css] of Object.entries({ field, search, select, date, time, stepper, weekday, keypad })) {
      expect(css, name).not.toMatch(/var\(--focus-ring\)/)
    }
    expect(field).not.toMatch(/\.ui-field__control:focus-within/)
    expect(search).not.toMatch(/\.search-field__control:focus-within/)
    expect(time).not.toMatch(/\.time-field:focus-within\s*\{[^}]*box-shadow/)
  })
})

const RING = /^var\(--focus-ring-width\) solid var\(--focus-ring-color\)$/
const FRAME_SELECTORS: [string, string, string][] = [
  ['TextField, NumberField, DateField control, while the input has focus', field, ".ui-field__control:has(:is(input, textarea, [role='spinbutton']):focus)"],
  ['SearchField, while the input has focus', search, '.search-field__control:has(input:focus)'],
  ['Select trigger', select, '.select__trigger:focus-visible'],
  ['DateField trigger', date, '.date-field__trigger:focus-visible'],
]

describe.each(FRAME_SELECTORS)('%s', (_name, css, selector) => {
  it('rings the frame with an outline (offset 0) and the accent border, and no box-shadow', () => {
    const d = declarations(css, selector)
    expect(d['outline']).toMatch(RING)
    expect(d['outline-offset']).toBe('0')
    expect(d['border-color']).toBe('var(--color-accent)')
    expect(d['box-shadow']).toBe('none')
  })

  it('has no second ring: no pale soft-strong halo', () => {
    expect(JSON.stringify(declarations(css, selector))).not.toMatch(/soft-strong/)
  })
})

describe('focus ring on the other field parts', () => {
  it('the inner inputs draw nothing of their own (focus is the frame level)', () => {
    expect(declarations(field, '.ui-field__input')['outline']).toBe('none')
    expect(declarations(search, '.search-field__input')['outline']).toBe('none')
  })

  it('the TimeField group rings with the outer outline while a segment has focus', () => {
    const rings = [...time.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*\.time-field(?::focus-within|:has\([^)]*\))[^{}]*)\{([^}]*)\}/g)]
    expect(rings.length).toBeGreaterThan(0)
    expect(rings.some((m) => /outline:\s*var\(--focus-ring-width\) solid var\(--focus-ring-color\)/.test(m[2]!))).toBe(true)
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

  it('an invalid field keeps the danger border while its entry is focused (error colour wins over the accent border)', () => {
    expect(declarations(field, ".ui-field[data-invalid] .ui-field__control:has(:is(input, textarea, [role='spinbutton']):focus)")['border-color']).toBe('var(--status-danger-fg)')
  })

  it('the Stepper value, the WeekdayPicker chip and the PriceKeypad key and display take the outer outline from the layer (no ring of their own)', () => {
    for (const [css, selector] of [[stepper, '.stepper__value:focus-visible'], [weekday, '.weekday-picker__chip:focus-visible'], [keypad, '.price-keypad__key:focus-visible'], [keypad, '.price-keypad__display:focus-visible']] as const) {
      const d = (() => {
        try {
          return declarations(css, selector)
        } catch {
          return {} as Record<string, string> // no rule at all: the global ring applies
        }
      })()
      expect(d['box-shadow'] ?? 'none', selector).not.toMatch(/focus-ring|accent/)
      expect(d['outline'] ?? 'x', selector).not.toBe('none')
    }
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
    expect(styles.match(/--focus-ring-color\s*:\s*([^;]+);/)?.[1] ?? '').toContain('var(--color-accent)')
  })
})
