// B9-55: the follow-ups the beta.9 build handed to the finishing package, one test each (see the hand-back for the list and the choices).
// Source and stylesheet pins, as the other CSS tests: vitest blanks CSS imports, so the files are read with node:fs.
import { describe, expect, it } from 'vitest'
import { blocksOf, readSrc, selectorList, sourceFiles } from '../ui/lib/cssWalk.test-helper'

const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const val = (file: string, selector: string, prop: string) =>
  blocksOf([], [file]).filter((b) => selectorList(q(b.selector)).includes(q(selector))).flatMap((b) => b.decls).filter(([p]) => p === prop).map(([, v]) => q(v)).pop()

describe('spoken quantities (B9-22): "12 kilograms" through lib/units spokenQuantity and a shared <Quantity>', () => {
  it('spokenQuantity speaks the unit in full, as Intl unit formatting does', async () => {
    const u = (await import('../lib/units')) as unknown as { spokenQuantity?: (n: number, b: 'g' | 'ml' | 'piece', s: 'metric' | 'imperial') => string }
    expect(typeof u.spokenQuantity).toBe('function')
    const s = u.spokenQuantity!
    expect([s(12000, 'g', 'metric'), s(1250, 'g', 'metric'), s(1000, 'g', 'metric'), s(250, 'g', 'metric'), s(1500, 'ml', 'metric'), s(250, 'ml', 'metric')]).toEqual([
      '12 kilograms', '1.25 kilograms', '1 kilogram', '250 grams', '1.5 liters', '250 milliliters',
    ])
    expect([s(1, 'piece', 'metric'), s(1250, 'piece', 'metric'), s(500, 'g', 'imperial'), s(100, 'g', 'imperial')]).toEqual(['1 piece', '1,250 pieces', '1 pound 2 ounces', '3.5 ounces'])
  })
  it('ui/Quantity.tsx exists, is on the barrel, shows formatQuantity aria-hidden and the spoken text in a .visually-hidden sibling', () => {
    const src = readSrc('ui/Quantity.tsx')
    expect(src).toMatch(/formatQuantity/)
    expect(src).toMatch(/spokenQuantity/)
    expect(src).toMatch(/aria-hidden/)
    expect(src).toMatch(/visually-hidden/)
    expect(readSrc('ui/index.ts')).toMatch(/Quantity/)
  })
  it.each(['stock/components/StockRow.tsx', 'stock/components/IngredientLotsRow.tsx', 'stock/components/PantryLotRow.tsx', 'stock/components/LotList.tsx', 'stock/components/PutAwaySheet.tsx'])('features/%s renders its amounts through <Quantity>', (f) => {
    const src = readSrc(`features/${f}`)
    expect(src).toMatch(/<Quantity\b/)
    expect(src).not.toMatch(/formatQuantity\(/)
  })
})

describe('IconButton link primitive and FileDrop outline', () => {
  it('IconButton takes `to` and renders a router Link with the icon-button class, the label as its name', () => {
    const src = readSrc('ui/IconButton.tsx')
    expect(src).toMatch(/\bto\??:/)
    expect(src).toMatch(/Link/)
  })
  it('no feature hand-writes className="icon-button" (ImportResult Edit uses IconButton to=...)', () => {
    const bad = sourceFiles('features').filter((f) => /className=["'`{][^>]*\bicon-button\b/.test(readSrc(f)))
    expect(bad).toEqual([])
  })
  it("FileDrop's outlined button lives in the primitive: features/import/import.css has no .file-drop__button rule", () => {
    expect(readSrc('features/import/import.css')).not.toMatch(/\.file-drop__button/)
    expect(readSrc('ui/fields/FileDrop.css')).toMatch(/\.file-drop__button\s*\{[^}]*border:\s*1px solid var\(--color-outline\)/)
  })
})

describe('tokens, sheets and Cook Mode', () => {
  it('the selected-state tokens are declared where a scheme subtree starts, so the Gallery dark panel shows dark values', () => {
    const blocks = blocksOf([], ['styles.css']).filter((b) => selectorList(b.selector).some((s) => /^\[data-scheme=['"](light|dark)['"]\]$/.test(s)))
    expect(blocks.length).toBeGreaterThan(1)
    for (const t of ['--selected-bg', '--selected-fg', '--selected-ring']) {
      for (const scheme of ['light', 'dark']) {
        const has = blocks.filter((b) => selectorList(b.selector).some((s) => s.includes(`'${scheme}'`))).some((b) => b.decls.some(([p]) => p === t))
        expect(has, `${t} declared with [data-scheme='${scheme}']`).toBe(true)
      }
    }
  })
  it('the sheet context is never one cut line: it wraps to at most two lines, so a long Recipe name does not hide the count', () => {
    expect(val('ui/BottomSheet.css', '.sheet__context', 'white-space')).not.toBe('nowrap')
    expect(val('ui/BottomSheet.css', '.sheet__context', '-webkit-line-clamp') ?? val('ui/BottomSheet.css', '.sheet__context', 'line-clamp')).toBe('2')
  })
  it('the Cook Mode timer strip that scrolls sideways at phone widths carries an edge fade (mask-image), or shows whole pills only', () => {
    const fade = val('features/cook/cook.css', '.cook-strip', 'mask-image') ?? val('features/cook/cook.css', '.cook-strip', '-webkit-mask-image')
    expect(fade, '.cook-strip mask-image').toMatch(/linear-gradient/)
  })
})

describe('ImagePicker names its noun for other users (w4b)', () => {
  it.each([
    ['features/ingredients/screens/IngredientScreen.tsx', 'Picture'],
    ['features/ingredients/components/NewIngredientSheet.tsx', 'Picture'],
    ['features/products/components/ProductForm.tsx', 'Picture'],
    ['features/products/screens/ProductScreen.tsx', 'Picture'],
    ['features/settings/components/MemberEditor.tsx', 'Photo'],
  ])('%s passes noun (%s)', (f) => {
    const src = readSrc(f)
    const jsx = /<ImagePicker\b[\s\S]*?\/>/.exec(src)?.[0] ?? ''
    expect(jsx, 'noun prop').toMatch(/\bnoun=/)
  })
  it('the compact Product picker also passes context (the Product name)', () => {
    expect(/<ImagePicker\b[\s\S]*?\/>/.exec(readSrc('features/products/screens/ProductScreen.tsx'))?.[0] ?? '').toMatch(/\bcontext=/)
  })
})

describe('P38 on /products/:id: Prices on one Shop and day have distinct Delete names', () => {
  it('the Price sheet or row names Delete Price with more than the Shop and date (the amount or pack)', () => {
    const src = readSrc('features/products/components/PriceEditor.tsx') + readSrc('features/products/strings.ts') + readSrc('features/products/screens/ProductScreen.tsx')
    expect(readSrc('features/products/strings.ts'), 'strings.deletePriceName(shop, date, amount): the accessible name of Delete Price').toMatch(/deletePriceName:\s*\(/)
    expect(src).toMatch(/deletePriceName\(/)
  })
})

describe('entry weight: the receipt watcher is imported by path (BETA.10 list, B9-55)', () => {
  it('no file outside features/receipt imports the features/receipt index', () => {
    const bad = [...sourceFiles('app'), ...sourceFiles('ui')].filter((f) => /from ['"][./]+\/features\/receipt['"]/.test(readSrc(f)))
    expect(bad).toEqual([])
  })
})
