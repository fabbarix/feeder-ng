// B9-09 (sweep-shop-stock), sources: no raw width query in code (DS-09: the em table and the container queries), the `.pg__*` classes gone
// from the Products, Shops and Stock components (DS-07: Stack, Cluster, Muted, SectionTitle), the CSS left standing, and the check-ui
// rules flipped to fail for these folders. Reads the files from disk.
import { describe, expect, it } from 'vitest'
import { code, cssRules, readFeature, readRepo, readText, rel, stripComments, sweepSources } from './cssSweep.test-helper'

const sources = sweepSources().map((p) => ({ file: rel(p), text: stripComments(readText(p)).replace(/^\s*\/\/.*$/gm, '') }))
const grep = (re: RegExp) => sources.filter((s) => re.test(s.text)).map((s) => s.file)

describe('B9-09: no width query in code (DS-09)', () => {
  it('has sources to check', () => {
    expect(sources.length).toBeGreaterThan(80)
  })
  it('no width in a useMediaQuery or matchMedia string (a width is useBreakpoint, useNarrow or a container query)', () => {
    expect(grep(/(useMediaQuery|matchMedia)\(\s*[`'"][^`'"]*(min|max)-width|(useMediaQuery|matchMedia)\(\s*[`'"][^`'"]*width\s*<|\d+px\)/)).toEqual([])
  })
  it('useMediaQuery is not called by these features at all (it is the implementation of useBreakpoint)', () => {
    expect(grep(/\buseMediaQuery\(\s*[`'"]\((min|max)-width/)).toEqual([])
    // a pointer query is not a width: NewProductForm keeps (pointer: coarse)
    expect(readFeature('scan/components/NewProductForm.tsx')).toMatch(/\(pointer: coarse\)/)
  })
  // Reviewer (B9-09): the test first asked for useBreakpoint('desktopWide') (the old 1280 px two-column Pantry). The only thing that
  // width chose was the Spoiled tile's layout, and that is now a container query on the tile's own width (stock.css, spoiled-tile),
  // so the screen has no width to read: it must not ask for one.
  it('StockScreen reads no viewport width', () => {
    const screen = code('stock/screens/StockScreen.tsx')
    expect(screen).not.toMatch(/useBreakpoint|useNarrow|useMediaQuery|matchMedia|innerWidth/)
    expect(screen).not.toMatch(/1280/)
  })
  // Main session ruling (B9-09): the header chips and the compact Restock reason keep today's 420 px, so no supported phone (375 to
  // 414 px) changes what it shows; useNarrow() (below 23.5 em) would show the full text at 390 px. One named exception in the Shop's
  // own lib, in em, until B9-15's container-driven chip fitting replaces it.
  it('Shop: the header chips and the compact Restock reason read the Shop\'s one named exception, (width < 26.25em), from lib/narrowChips', () => {
    const hook = code('shop/hooks/useNarrowChips.ts')
    expect(hook).toMatch(/useMediaQuery\(NARROW_CHIPS_QUERY\)/)
    expect(hook).toMatch(/from '\.\.\/lib\/narrowChips'/)
    expect(hook).not.toMatch(/420|min-width|px/)
    const lib = readFeature('shop/lib/narrowChips.ts')
    expect(code('shop/lib/narrowChips.ts')).toMatch(/export const NARROW_CHIPS_QUERY = '\(width < 26\.25em\)'/)
    expect(lib).toMatch(/B9-15/)
  })
  it('the only width query string in these sources is that exception (26.25 em, in shop/lib/narrowChips.ts)', () => {
    const found = sources.flatMap((s) => [...s.text.matchAll(/\((?:min-|max-)?width\s*[:<>]=?\s*[\d.]+(?:px|em|rem)\)/g)].map((m) => `${s.file}: ${m[0]}`))
    expect(found).toEqual(['shop/lib/narrowChips.ts: (width < 26.25em)'])
  })
  it('Stock: the spoiled tile no longer reads the viewport (its layout is the container query in stock.css)', () => {
    const tile = code('stock/components/SpoiledTile.tsx')
    expect(tile).not.toMatch(/useMediaQuery|matchMedia|useBreakpoint|820/)
  })
})

describe('B9-09: the .pg__* styling is gone from Products, Shops and Stock (DS-07; B9-DRIFT-W1 items 5 and 7)', () => {
  const FOLDERS = /^(products|shops|stock|ingredients|shop|scan|receipt)\//
  const used = sources.filter((s) => FOLDERS.test(s.file)).flatMap((s) => [...s.text.matchAll(/["'`{ ](pg(?:__[a-z-]+)?)(?=["'`} ])/g)].map((m) => `${s.file}: ${m[1]}`))

  it('no component uses pg, pg__stack, pg__row, pg__group, pg__tile-title, pg__muted, pg__subhead or pg__add-price', () => {
    expect(used.filter((u) => !u.endsWith(': pg__error'))).toEqual([])
  })
  it('the only .pg__ class left is pg__error (its field-error pattern belongs to SAFE; it is not decided here)', () => {
    expect(new Set(used.map((u) => u.split(': ')[1]))).toEqual(new Set(['pg__error']))
  })
  it('products.css keeps no layout, title or subhead class: .pg, .pg__stack, .pg__row, .pg__group, .pg__tile-title, .pg__subhead, .pg__add-price', () => {
    const selectors = cssRules(readFeature('products/products.css')).flatMap((r) => r.selector.split(',').map((s) => s.trim()))
    for (const gone of ['.pg', '.pg__stack', '.pg__row', '.pg__group', '.pg__tile-title', '.pg__subhead', '.pg__add-price']) expect(selectors).not.toContain(gone)
  })
  it('.pg__muted is gone too (w1c): B9-10 moved features/tags and features/settings to <Muted> (its own test covers those folders), and none of these folders uses it', () => {
    const selectors = cssRules(readFeature('products/products.css')).flatMap((r) => r.selector.split(',').map((s) => s.trim()))
    expect(selectors).not.toContain('.pg__muted')
    expect(sources.filter((s) => /["'`{ ]pg__muted["'`} ]/.test(s.text)).map((s) => s.file)).toEqual([])
  })
  it('the new primitives are used in their place (Muted, SectionTitle, Stack, Cluster)', () => {
    expect(readFeature('shops/components/ShopLocationTile.tsx')).toMatch(/<SectionTitle[ >]/)
    expect(readFeature('shops/components/ShopLocationTile.tsx')).toMatch(/<Muted[ >]/)
    expect(readFeature('stock/screens/StoragePlacesScreen.tsx')).toMatch(/<Muted[ >]/)
    expect(readFeature('stock/components/LotSheet.tsx')).toMatch(/<Stack[ >]/)
    expect(readFeature('shops/components/WeightRuleList.tsx')).toMatch(/<Stack[ >]/)
    expect(readFeature('shops/components/WeightRuleEditor.tsx')).toMatch(/<SectionTitle as="h3"/)
  })
})

describe('B9-09: the check-ui rules fail for these folders (plan 3 section 3, B9-09 "Done")', () => {
  const FOLDER_PATHS = ['shop', 'scan', 'stock', 'receipt', 'ingredients', 'products', 'shops'].map((f) => `web/src/features/${f}`)
  const text = readRepo('scripts/check-ui.rules.d/b9-09.rules')
  const failPaths = (rule: string) => {
    const line = text.split('\n').find((l) => l.replace(/\s/g, '').startsWith(`${rule}.fail_paths=`))
    return line ? line.slice(line.indexOf('=') + 1).split('#')[0]!.trim().split(/\s+/) : []
  }

  it('scripts/check-ui.rules.d/b9-09.rules exists (it can be added once B9-07 has merged the new rules: an unknown rule name stops check-ui)', () => {
    expect(text).not.toBe('')
  })
  for (const rule of ['focus-ring', 'raw-radius', 'raw-spacing', 'media-width', 'opacity-muting', 'type-scale']) {
    it(`${rule}.fail_paths lists the seven folders`, () => {
      expect(failPaths(rule)).toEqual(expect.arrayContaining(FOLDER_PATHS))
    })
  }
})
