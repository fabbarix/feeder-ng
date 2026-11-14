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
  it('Stock: the two-column Pantry is useBreakpoint(\'desktopWide\') (80 em, was 1280 px)', () => {
    expect(code('stock/screens/StockScreen.tsx')).toMatch(/useBreakpoint\(\s*['"]desktopWide['"]\s*\)/)
    expect(code('stock/screens/StockScreen.tsx')).not.toMatch(/1280/)
  })
  it('Shop: the header chips and the narrow rows read useNarrow() (the DS-09 narrow band), not 420 px', () => {
    const hook = code('shop/hooks/useNarrowChips.ts')
    expect(hook).toMatch(/useNarrow\(\)/)
    expect(hook).not.toMatch(/420|min-width/)
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
  it('.pg__muted is allowed to stay only while features/tags still uses it, and then it is the meta role in --color-muted with no opacity', () => {
    const r = cssRules(readFeature('products/products.css')).filter((x) => x.selector === '.pg__muted')
    if (r.length === 0) return
    const d = Object.fromEntries(r.flatMap((x) => x.decls))
    expect(d['opacity']).toBeUndefined()
    expect(d['color']).toBe('var(--color-muted)')
    expect(d['font-size']).toBe('var(--text-meta-size)')
    expect(d['line-height']).toBe('var(--text-meta-line)')
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
