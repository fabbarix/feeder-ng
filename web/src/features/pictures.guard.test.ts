// PE guard: an entity picture (Ingredient, Product, Member) is drawn only by the shared primitives in web/src/ui
// (Thumb for Ingredients and Products, Avatar for Members), never by a feature's own <img> or a copied slot.
// Recipe and Step photos (cook, recipes) and the import review's uploaded pages are not entity pictures and are out of scope.
import { describe, expect, it } from 'vitest'

const raw = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.*', '!./**/*.test-helper.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const files = Object.entries(raw).map(([p, text]) => ({ rel: p.replace(/^\.\//, ''), text: strip(text) }))

/** Features where every picture is an Ingredient, Product or Member picture. */
const ENTITY_FEATURES = ['access', 'ingredients', 'plan', 'products', 'scan', 'settings', 'shop', 'shops', 'stock', 'today']

describe('pictures everywhere: one primitive', () => {
  it('no <img> in the features that show Ingredients, Products and Members', () => {
    for (const f of files.filter((f) => ENTITY_FEATURES.some((n) => f.rel.startsWith(`${n}/`)))) expect(f.text, f.rel).not.toMatch(/<img[\s>/]/)
  })

  it('the local PictureThumb and the Ingredient list slot are gone', () => {
    for (const f of files) {
      expect(f.text, f.rel).not.toMatch(/\bPictureThumb\b/)
      expect(f.text, f.rel).not.toMatch(/ingredient-row__no-picture/)
    }
  })

  it('an Ingredient or Product Picture never goes through RecipeThumb (its generated Recipe tile is wrong for a pack)', () => {
    for (const f of files.filter((f) => ENTITY_FEATURES.some((n) => f.rel.startsWith(`${n}/`)))) expect(f.text, f.rel).not.toMatch(/<RecipeThumb[^>]*name=""/)
  })
})
