// B9-55 (A11Y-04, docs/design/ui-review-3/a11y.md; plan section 9): the forced-colours layer of the primitives, ONE file,
// web/src/ui/forcedColors.css, imported LAST by ui/index.ts. The mocks a11y-04-forced-{prefs,pantry,shop}.html hold the proposed block.
//   - controls: a 1 px ButtonText border; the ruled Search field and Segmented track keep a 2 px ButtonText bottom rule
//     (--field-rule-width, A11Y-05); tiles, list groups, the bottom bar and toasts: a 1 px CanvasText border;
//   - a selected, pressed, checked or current state is Highlight on HighlightText (the one place !important is allowed);
//   - colour swatches keep their colour (forced-color-adjust: none) with a CanvasText border, the chosen one a Highlight ring;
//   - disabled is GrayText; every focus ring, outer or nested, is an outline in Highlight, and a nested control's soft fill is Canvas;
//   - features add no forced-colours rule of their own.
// Real layout (Chrome with forced colours emulated) is scripts/test/ds-layout_test.sh, fixture forced-colors.html.
// Fails today because the file does not exist: every test reads it.
import { describe, expect, it } from 'vitest'
import { blocksOf, cssFiles, readSrc, selectorList, type CssBlock } from './lib/cssWalk.test-helper'

const FILE = 'ui/forcedColors.css'
const layer = blocksOf(['ui']).filter((b) => b.file === FILE)
const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const inLayer = (selector: string): CssBlock[] => layer.filter((b) => selectorList(q(b.selector)).includes(q(selector)))
/** The last value of `prop` over the layer's rules for exactly this selector (undefined when none). */
const val = (selector: string, prop: string): string | undefined =>
  inLayer(selector)
    .flatMap((b) => b.decls)
    .filter(([p]) => p === prop)
    .map(([, v]) => v)
    .pop()

describe('ui/forcedColors.css exists and holds only the forced-colours layer (A11Y-04)', () => {
  it('the file exists and has rules', () => {
    expect(readSrc(FILE).length, `${FILE} is missing`).toBeGreaterThan(200)
    expect(layer.length).toBeGreaterThan(10)
  })
  it('every rule is inside @media (forced-colors: active)', () => {
    expect(layer.length, `${FILE} has no rules`).toBeGreaterThan(0)
    const outside = layer.filter((b) => !b.atrules.some((a) => /^@media\s*\(\s*forced-colors:\s*active\s*\)$/.test(a)))
    expect(outside.map((b) => `${b.line} ${b.selector}`)).toEqual([])
  })
  it('is imported last by ui/index.ts: after every other import and export-from, so it follows every component stylesheet', () => {
    const lines = readSrc('ui/index.ts').split('\n')
    const at = lines.findIndex((l) => /^\s*import\s+['"]\.\/forcedColors\.css['"]/.test(l))
    expect(at, "ui/index.ts has no import './forcedColors.css'").toBeGreaterThanOrEqual(0)
    const later = lines.slice(at + 1).filter((l) => /^\s*(import\b|export\b[^=]*\bfrom\b|export\s+\*)/.test(l))
    expect(later, 'nothing is imported or re-exported after it').toEqual([])
  })
  it('no other stylesheet of web/src has a forced-colors rule: features add none (and styles.css, ui/ and app/ leave it to this layer)', () => {
    const others = ['ui', 'app', 'features'].flatMap(cssFiles).filter((f) => f !== FILE)
    const withRule = [...others, 'styles.css'].filter((f) => /forced-colors/.test(readSrc(f).replace(/\/\*[\s\S]*?\*\//g, '')))
    expect(withRule).toEqual([])
  })
})

describe('boundaries (1.4.11): controls ButtonText, containers CanvasText, the ruled shapes keep a 2 px rule', () => {
  const CONTROLS = ['.button', '.icon-button', '.chip', '.choice-chip', '.your-menu-button', '.line-row__tick', '.search-field__control', '.segmented', '.stepper__value', '.price-keypad__key', '.switch']
  it.each(CONTROLS)('%s has a 1 px ButtonText border', (sel) => {
    expect(q(val(sel, 'border') ?? '')).toBe('1px solid ButtonText')
  })
  it.each(['.tile', '.list-group', '.bottom-bar', '.toast'])('%s has a 1 px CanvasText border', (sel) => {
    expect(q(val(sel, 'border') ?? '')).toBe('1px solid CanvasText')
  })
  it('the Search field and the Segmented track keep the 2 px rule (--field-rule-width) in ButtonText on top of the 1 px frame', () => {
    for (const sel of ['.search-field__control', '.segmented']) expect(q(val(sel, 'border-block-end') ?? ''), sel).toBe('var(--field-rule-width) solid ButtonText')
    expect(readSrc('ui/fields/Field.css')).toMatch(/--field-rule-width:\s*2px/)
  })
  it('every class the layer names exists in a stylesheet of the app (no rule for a ghost)', () => {
    expect(layer.length, `${FILE} has no rules`).toBeGreaterThan(0)
    const css = ['ui', 'app', 'features'].flatMap(cssFiles).filter((f) => f !== FILE).map(readSrc).join('\n')
    const named = new Set<string>()
    for (const b of layer) for (const m of b.selector.matchAll(/\.([a-z][a-z0-9_-]*)/g)) named.add(m[1]!)
    const ghosts = [...named].filter((c) => !new RegExp(`\\.${c}(?![a-z0-9_-])`).test(css))
    expect(ghosts).toEqual([])
  })
})

describe('selected, pressed, checked and current are Highlight on HighlightText', () => {
  const SELECTED = [
    ".segmented__option[aria-checked='true']",
    ".icon-button[aria-pressed='true']",
    ".choice-chip[aria-pressed='true']",
    ".chip[aria-pressed='true']",
    ".checkbox__box[data-state='checked']",
    ".checkbox__box[data-state='mixed']",
    ".switch[aria-checked='true']",
  ]
  it.each(SELECTED)('%s: Highlight fill, HighlightText, Highlight border, with !important (it must beat every variant rule)', (sel) => {
    const rules = inLayer(sel)
    expect(rules.length, sel).toBeGreaterThan(0)
    const d = (p: string) => rules.flatMap((b) => b.decls).filter(([x]) => x === p).map(([, v]) => q(v)).pop()
    expect(d('background')).toBe('Highlight !important')
    expect(d('color')).toBe('HighlightText !important')
    expect(d('border-color')).toBe('Highlight !important')
    expect(d('forced-color-adjust')).toBe('none !important')
  })
  it('the current page of the bottom bar and the side rail is Highlight on HighlightText (forced-color-adjust: none)', () => {
    for (const sel of [".bottom-bar__link[aria-current='page']", ".side-rail__link[aria-current='page'] .side-rail__pill"]) {
      expect(val(sel, 'forced-color-adjust'), sel).toBe('none')
      expect(val(sel, 'background'), sel).toBe('Highlight')
      expect(val(sel, 'color'), sel).toBe('HighlightText')
    }
  })
  it('the Switch thumb is ButtonText, HighlightText when on', () => {
    expect(val('.switch__thumb', 'background')).toBe('ButtonText')
    expect(val('.switch__thumb', 'forced-color-adjust')).toBe('none')
    expect(val(".switch[aria-checked='true'] .switch__thumb", 'background')).toBe('HighlightText')
  })
  it('!important appears in this layer only on the selected states: nowhere else in the layer', () => {
    expect(layer.length, `${FILE} has no rules`).toBeGreaterThan(0)
    const bad = layer.filter((b) => b.decls.some(([, v]) => /!important/.test(v)) && !SELECTED.some((s) => selectorList(q(b.selector)).includes(q(s))))
    expect(bad.map((b) => `${b.line} ${b.selector}`)).toEqual([])
  })
})

describe('colour swatches keep their colour; the chosen one has a Highlight ring', () => {
  it('a swatch: forced-color-adjust none and a 1 px CanvasText border', () => {
    expect(val('.colour-swatch', 'forced-color-adjust')).toBe('none')
    expect(q(val('.colour-swatch', 'border') ?? '')).toBe('1px solid CanvasText')
  })
  it('the chosen swatch: a 3 px Highlight outline at 3 px, no box-shadow', () => {
    const sel = ".colour-swatch[aria-checked='true']"
    expect(q(val(sel, 'outline') ?? '')).toBe('3px solid Highlight')
    expect(val(sel, 'outline-offset')).toBe('3px')
    expect(val(sel, 'box-shadow')).toBe('none')
  })
})

describe('disabled is GrayText; focus is Highlight, outer and nested', () => {
  it(':disabled and [aria-disabled] are GrayText with opacity 1', () => {
    for (const sel of [':disabled', "[aria-disabled='true']"]) {
      expect(val(sel, 'color'), sel).toBe('GrayText')
      expect(val(sel, 'border-color'), sel).toBe('GrayText')
      expect(val(sel, 'opacity'), sel).toBe('1')
    }
  })
  it('every focus ring is an outline in Highlight: the global ring and the three frames that ring instead of their control', () => {
    for (const sel of [
      ':focus-visible',
      ".ui-field__control:has(:is(input, textarea, [role='spinbutton']):focus)",
      '.search-field__control:has(input:focus)',
      '.segmented:has(.segmented__option:focus-visible)',
    ]) {
      expect(val(sel, 'outline-color'), sel).toBe('Highlight')
    }
  })
  it('a nested control (stepper - and +, Clear search, a button in a data-focus-scope) keeps its inner ring in Highlight on a Canvas fill', () => {
    const sel = ":is(.ui-field__control, .search-field__control, [data-focus-scope]) :is(button, [role='button'], a):focus-visible"
    expect(val(sel, 'outline-color')).toBe('Highlight')
    expect(val(sel, 'background')).toBe('Canvas')
  })
})

describe('every selected-state selector of ui/ and app/ has a counterpart in the layer (the chapter\'s unit test)', () => {
  const ATTR = /\[aria-(?:pressed|checked|selected)=['"]true['"]\]|\[aria-current=['"]page['"]\]|\[data-state=['"](?:checked|mixed)['"]\]/g
  /** "class|attribute" for every compound of a selector that carries a selected-state attribute. */
  const pairs = (selector: string): string[] => {
    const out: string[] = []
    for (const compound of selector.replace(/:(hover|active|focus-visible|focus|not|disabled)(\([^)]*\))?/g, '').split(/\s*[\s>+~]\s*/)) {
      const attrs = compound.match(ATTR)
      if (!attrs) continue
      const cls = /\.([a-z][a-z0-9_-]*)/.exec(compound)?.[1] ?? '*'
      for (const a of attrs) out.push(`${cls}|${q(a)}`)
    }
    return out
  }
  const have = new Set(layer.flatMap((b) => selectorList(b.selector)).flatMap(pairs))
  const sites = ['ui', 'app']
    .flatMap((d) => blocksOf([d]))
    .filter((b) => b.file !== FILE && !/Gallery/.test(b.file))
    .flatMap((b) => selectorList(b.selector).flatMap(pairs).map((p) => [p, `${b.file}:${b.line}`] as const))
  const needed = [...new Set(sites.map(([p]) => p))].sort()
  it('there are selected-state selectors to cover (the test reads the real stylesheets)', () => {
    expect(needed.length).toBeGreaterThan(8)
  })
  it.each(needed)('%s is in forcedColors.css', (pair) => {
    expect(have.has(pair), `${pair} (first seen at ${sites.find(([p]) => p === pair)?.[1]})`).toBe(true)
  })
})
