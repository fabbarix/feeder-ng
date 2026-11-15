// B9-30 (SAFE-04): the old loose field-error paragraph is gone from Shops and Products. `.pg__error` (10 uses) becomes the field-error
// pattern (a field's own `error`, focused by useFocusFirstInvalid) or <FormError> for a form-level failure. A source scan, so nothing
// creeps back: no `pg__error` class, no hand-written role="alert" (FormError draws the only one), no Add Shop disabled for want of a name.
import { describe, expect, it } from 'vitest'

const raw = import.meta.glob(['../products/**/*.{ts,tsx,css}', '../shops/**/*.{ts,tsx,css}', '!../**/*.test.*', '!../**/*.test-helper.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const files = Object.entries(raw).map(([path, text]) => ({ rel: path.replace(/^\.\.\//, ''), text: text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') }))
const file = (rel: string) => files.find((f) => f.rel === rel)?.text ?? ''

describe('Shops and Products have one field-error pattern', () => {
  it('finds the sources it scans', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it('no source uses the .pg__error class, and products.css no longer defines it', () => {
    expect(files.filter((f) => /pg__error/.test(f.text)).map((f) => f.rel)).toEqual([])
  })

  it('no source writes role="alert" by hand: <FormError> is the only form-level alert', () => {
    expect(files.filter((f) => /role=["']alert["']/.test(f.text)).map((f) => f.rel)).toEqual([])
  })

  it('every form that reports a failure uses FormError', () => {
    const forms = [
      'shops/components/AddShopSheet.tsx',
      'shops/components/ShopList.tsx',
      'shops/components/WeightRuleEditor.tsx',
      'shops/components/ShopLocationTile.tsx',
      'shops/screens/ShopScreen.tsx',
      'products/components/PriceEditor.tsx',
      'products/components/ProductForm.tsx',
      'products/screens/ProductScreen.tsx',
    ]
    expect(forms.filter((f) => !/FormError/.test(file(f)))).toEqual([])
  })

  it('Add Shop and Rename Shop are not disabled for an empty name: the form explains instead', () => {
    expect(files.filter((f) => /disabled=\{\s*name\.trim\(\)\s*===\s*''\s*\}/.test(f.text)).map((f) => f.rel)).toEqual([])
  })
})
