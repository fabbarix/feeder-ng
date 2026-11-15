// B9-09 (sweep-shop-stock): the folder sweep of Shop, Scan, Stock, Receipt, Ingredients, Products and Shops, as a contract over every
// stylesheet and source file of those seven folders (not a list of known classes): em width queries (DS-09), container queries in rem,
// one focus ring (A11Y-02), tokens for radius, spacing and type (DS-11, DS-08), no opacity muting, and no size-only class that drifts
// off the body role (DS-07, build/ui-review-3/B9-DRIFT-W1.md). jsdom does not lay out; the real build is the page-layout guard's.
import { describe, expect, it } from 'vitest'
import { sweepRules, sweepStylesheets, rel, type CssRule } from './cssSweep.test-helper'

const rules = sweepRules()
const where = (r: CssRule) => `${r.file}: ${r.selector}${r.context.length ? ` in ${r.context.join(' ')}` : ''}`
const decl = (r: CssRule, prop: string) => r.decls.filter(([p]) => p === prop).map(([, v]) => v)
const BAND_EM = [23.5, 37.5, 48, 64, 80, 90] // the DS-09 table (ui/lib/breakpoints): narrow (below 376 px, amendment A1), tablet, md, desktop, desktop-wide, wide

describe('B9-09: the sweep reads the seven folders', () => {
  it('finds the stylesheets of the folders (so no check below passes on nothing)', () => {
    const files = sweepStylesheets().map(rel).sort()
    for (const f of ['shop/shop.css', 'scan/scan.css', 'scan/components/NewProductSheet.css', 'stock/stock.css', 'receipt/receipt.css', 'ingredients/ingredients.css', 'products/products.css'])
      expect(files).toContain(f)
    expect(rules.length).toBeGreaterThan(150)
  })
})

describe('B9-09: width queries are the DS-09 em table (min-width only, or width < narrow)', () => {
  const widthQueries = rules.flatMap((r) => r.context.filter((c) => c.startsWith('@media') && /width/.test(c)).map((c) => ({ c, r })))

  it('has width queries to check', () => {
    expect(widthQueries.length).toBeGreaterThanOrEqual(6)
  })
  it('no media query is in px, and none is max-width (a pair of them leaves a sub-pixel band)', () => {
    const bad = widthQueries.filter(({ c }) => /\d\s*px|max-width/.test(c)).map(({ c, r }) => `${where(r)} -> ${c}`)
    expect(bad).toEqual([])
  })
  it('every width condition is (min-width: Xem) or (width < Xem) with X in 23.5, 37.5, 48, 64, 80, 90', () => {
    const bad: string[] = []
    for (const { c, r } of widthQueries) {
      const conds = [...c.matchAll(/\((min-width:\s*([\d.]+)em|width\s*<\s*([\d.]+)em|[^)]*width[^)]*)\)/g)]
      for (const m of conds) {
        const x = Number(m[2] ?? m[3])
        if (!BAND_EM.includes(x)) bad.push(`${where(r)} -> ${m[0]}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('the converted queries land on the bands the chapter names (shop 37.5 and 48, scan 48, stock 80 and B9-29\'s 37.5, ingredients 37.5)', () => {
    const heads = (file: string) => new Set(rules.filter((r) => r.file === file).flatMap((r) => r.context.filter((c) => c.startsWith('@media') && /width/.test(c))))
    expect([...heads('shop/shop.css')].sort()).toEqual(['@media (min-width: 37.5em)', '@media (min-width: 48em)'])
    expect([...heads('scan/scan.css')].sort()).toEqual(['@media (min-width: 48em)', '@media (width < 48em)'])
    expect([...heads('stock/stock.css')]).toEqual(['@media (min-width: 80em)', '@media (min-width: 37.5em)'])
    expect([...heads('ingredients/ingredients.css')]).toEqual(['@media (min-width: 37.5em)'])
  })
})

describe('B9-09: component-fit thresholds are container queries in rem', () => {
  const queries = rules.flatMap((r) => r.context.filter((c) => c.startsWith('@container')).map((c) => ({ c, r })))

  it('every @container condition is in rem (no px, no em)', () => {
    expect(queries.length).toBeGreaterThanOrEqual(3)
    const bad = queries.filter(({ c }) => /[\d.]\s*(px|em)\b/.test(c.replace(/rem/g, ''))).map(({ c, r }) => `${where(r)} -> ${c}`)
    expect(bad).toEqual([])
  })
  it('every named container is declared (container-name or container:) with container-type: inline-size', () => {
    const declared = new Set(
      rules.flatMap((r) => [...decl(r, 'container-name'), ...decl(r, 'container').map((v) => v.split('/')[0]!.trim())]).flatMap((v) => v.split(/\s+/)),
    )
    for (const { c } of queries) {
      const name = /^@container\s+([a-z][\w-]*)\s*\(/.exec(c)?.[1]
      if (name) expect(declared, `${c} names a container nothing declares`).toContain(name)
    }
    expect(rules.some((r) => decl(r, 'container-type').includes('inline-size'))).toBe(true)
  })
  it('Ingredients: the Base Unit and Shelf Life tiles stack in @container ingredient-tiles (width < 34rem) (was max-width 559px)', () => {
    const r = rules.find((x) => x.selector === '.ingredient__tile' && x.context.includes('@container ingredient-tiles (width < 34rem)'))
    expect(r, '.ingredient__tile in the ingredient-tiles container query').toBeDefined()
    expect(decl(r!, 'grid-column')).toEqual(['1 / -1'])
    expect(rules.some((x) => decl(x, 'container-name').includes('ingredient-tiles') || decl(x, 'container').some((v) => v.startsWith('ingredient-tiles')))).toBe(true)
  })
  it('Shop: the narrow-row block (hint room) is @container (width < 24rem), not a viewport query (was width < 420px)', () => {
    const inBlock = rules.filter((x) => x.file === 'shop/shop.css' && x.context.includes('@container (width < 24rem)')).map((x) => x.selector)
    expect(inBlock).toContain('.shop-lines .list-row')
    expect(inBlock).toContain('.shop-lines .list-row__control')
  })
  it('Stock: the spoiled tile places its actions in @container spoiled-tile (min-width: 44rem) (was a 820 px useMediaQuery)', () => {
    const r = rules.filter((x) => x.file === 'stock/stock.css' && x.context.includes('@container spoiled-tile (min-width: 44rem)'))
    expect(r.length).toBeGreaterThan(0)
    expect(rules.some((x) => decl(x, 'container-name').includes('spoiled-tile') || decl(x, 'container').some((v) => v.startsWith('spoiled-tile')))).toBe(true)
  })
})

describe('B9-09: one focus ring (A11Y-02): no feature-local ring', () => {
  const focusRules = rules.filter((r) => /:focus/.test(r.selector))

  it('nothing references the removed --focus-ring box-shadow token', () => {
    const bad = rules.filter((r) => r.decls.some(([, v]) => /var\(--focus-ring\)/.test(v))).map(where)
    expect(bad).toEqual([])
  })
  it('no :focus rule hides the ring (outline: none / 0) or draws a box-shadow ring', () => {
    // B9-34 (R-C+, mocks ssp-01/ssp-18): the one exception is the Shop tick, whose visible 24 px circle takes the ring as its border
    // (.line-row__tick:focus-visible::before, an accent border on a soft fill); the 44 px button itself draws no outline
    const ringOnCircle = (r: (typeof focusRules)[number]) => /^\.line-row__tick(\[aria-pressed='true'\])?:focus-visible$/.test(r.selector.trim())
    const bad = focusRules.filter((r) => !ringOnCircle(r) && (decl(r, 'outline').some((v) => /^(none|0)\b/.test(v)) || decl(r, 'box-shadow').length > 0)).map(where)
    expect(bad).toEqual([])
  })
  it('an outline anywhere in the folders uses the ring tokens (width, offset, colour), never a raw px or the accent', () => {
    const bad: string[] = []
    for (const r of rules)
      for (const [p, v] of r.decls) {
        if (p === 'outline' && !/^var\(--focus-ring-(width|inner-width)\) solid var\(--focus-ring-color\)$/.test(v) && !/^none$/.test(v)) bad.push(`${where(r)} ${p}: ${v}`)
        if (p === 'outline-color' && v !== 'var(--focus-ring-color)') bad.push(`${where(r)} ${p}: ${v}`)
        if (p === 'outline-offset' && !/^(0|var\(--focus-ring-offset(-inset)?\)|calc\(-1 \* var\(--focus-ring-(inner-width|width|offset)\)\))$/.test(v)) bad.push(`${where(r)} ${p}: ${v}`)
      }
    expect(bad).toEqual([])
  })
  it('the row whose Price is being entered keeps its inside ring, on the tokens (R-C: inside its own edge, 2 px inner width)', () => {
    const r = rules.find((x) => x.selector === ".list-row[data-pricing='true']")
    expect(r).toBeDefined()
    expect(decl(r!, 'outline')).toEqual(['var(--focus-ring-inner-width) solid var(--focus-ring-color)'])
    expect(decl(r!, 'outline-offset')).toEqual(['calc(-1 * var(--focus-ring-inner-width))'])
  })
})

describe('B9-09: radius and spacing are tokens (DS-11)', () => {
  const RADIUS = /^(var\(--radius-[a-z0-9-]+\)|0|inherit)$/
  it('every border radius is a --radius-* token', () => {
    const bad: string[] = []
    for (const r of rules) for (const [p, v] of r.decls) if (/^border(-[a-z]+){0,2}-radius$/.test(p) && !v.split(' ').every((x) => RADIUS.test(x))) bad.push(`${where(r)} ${p}: ${v}`)
    expect(bad).toEqual([])
  })

  const SPACING = /^(gap|row-gap|column-gap|margin|margin-[a-z-]+|padding|padding-[a-z-]+|inset|inset-[a-z-]+|top|right|bottom|left|scroll-padding[a-z-]*)$/
  it('gap, margin, padding and inset hold no raw px/rem/em length, nor a raw fallback inside var() (viewport-relative room is exempt)', () => {
    const bad: string[] = []
    for (const r of rules)
      for (const [p, v] of r.decls) {
        if (!SPACING.test(p) || /d?[sl]?v[hw]\b|dvh|svh|lvh|vw|vh/.test(v)) continue
        const raw = /(^|[^\w.-])-?\d*\.?\d*[1-9]\d*(\.\d+)?(px|rem|em|ch)\b/
        if (raw.test(v.replace(/var\(--[a-z0-9-]+\)/g, ''))) bad.push(`${where(r)} ${p}: ${v}`)
      }
    expect(bad).toEqual([])
  })
})

describe('B9-09: type is a token, and a size never drifts off the body role (DS-08, DS-07)', () => {
  const sized = rules.filter((r) => decl(r, 'font-size').length > 0 && !decl(r, 'font-size').every((v) => v === 'inherit'))

  it('has sized classes to check', () => {
    expect(sized.length).toBeGreaterThan(15)
  })
  it('font-size is a --text-*-size token or inherit (no raw rem or px)', () => {
    const bad: string[] = []
    for (const r of rules) for (const v of decl(r, 'font-size')) if (!/^(inherit|var\(--text-[a-z0-9-]+-size\))$/.test(v)) bad.push(`${where(r)} font-size: ${v}`)
    expect(bad).toEqual([])
  })
  it('every rule that sets a font-size sets its role\'s line-height too (else it inherits the 22 px body line: B9-DRIFT-W1 items 1-11)', () => {
    const bad = sized
      .filter((r) => {
        const size = /var\(--text-([a-z0-9-]+)-size\)/.exec(decl(r, 'font-size').at(-1)!)?.[1]
        const line = decl(r, 'line-height').at(-1)
        return !size || !line || line !== `var(--text-${size}-line)`
      })
      .map((r) => `${where(r)} font-size: ${decl(r, 'font-size').at(-1)}, line-height: ${decl(r, 'line-height').at(-1) ?? '(none)'}`)
    expect(bad).toEqual([])
  })
})

describe('B9-09: muting is a colour, not an opacity (DS-11)', () => {
  it('no opacity between 0.05 and 0.95 outside a disabled state or a pseudo-element, and no filter: opacity()', () => {
    const bad: string[] = []
    for (const r of rules)
      for (const [p, v] of r.decls) {
        const exempt = /:disabled|\[disabled|\[aria-disabled|::?(before|after)/.test(r.selector)
        const n = p === 'opacity' ? Number(v) : NaN
        if (!exempt && n >= 0.05 && n <= 0.95) bad.push(`${where(r)} opacity: ${v}`)
        if (p === 'filter' && /opacity\(/.test(v)) bad.push(`${where(r)} filter: ${v}`)
      }
    expect(bad).toEqual([])
  })
})
