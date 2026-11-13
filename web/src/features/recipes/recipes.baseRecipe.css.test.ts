// CSS contract of the Base recipe screens (jsdom does not lay out): every class the BR-D components use has a rule, and the rules follow Bento
// (docs/design/ux-brief.md: tonal surfaces, 20-32 px corners, spacing and colour tokens only, 44 px tap targets).
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '')
const recipesCss = strip(readSource('features/recipes/recipes.css'))
const ingredientsCss = strip(readSource('features/ingredients/ingredients.css'))
const selectCss = strip(readSource('ui/Select/Select.css'))

/** Rule bodies whose selector list mentions `.name` as a whole class (not `.name__x`), at any @media depth. */
const bodies = (css: string, name: string): string[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => new RegExp(`\\.${name}(?![\\w-])`).test(selector!))
    .map(([, , body]) => body!)

const RECIPES = [
  'picker-list', 'picker-group', 'picker-group__label', 'picker-row', 'picker-row__name', 'picker-row__detail', 'picker-row__reason',
  'needed-at', 'needed-at__trigger', 'needed-at__menu', 'needed-at__item',
  'link-candidate', 'link-candidate__archived',
  'recipe-tile__yield',
]
const INGREDIENTS = ['ingredient__base', 'ingredient__helper', 'ingredient__locked']

describe('every new class has a rule', () => {
  it.each(RECIPES)('recipes.css styles .%s', (name) => expect(bodies(recipesCss, name).length).toBeGreaterThan(0))
  it.each(INGREDIENTS)('ingredients.css styles .%s', (name) => expect(bodies(ingredientsCss, name).length).toBeGreaterThan(0))
  it('Select.css styles .select__badge', () => expect(bodies(selectCss, 'select__badge').length).toBeGreaterThan(0))

  it('no component uses a class that is not in this list or an existing stylesheet', () => {
    const sources = [
      'features/recipes/components/BaseRecipePicker.tsx', 'features/recipes/components/LinkCandidatesSheet.tsx', 'features/recipes/components/NeededAtMenu.tsx',
      'features/recipes/components/TakeOverDialog.tsx', 'features/recipes/components/RecipeKindControl.tsx', 'features/recipes/components/BaseRecipeBadge.tsx',
    ]
    const known = new Set([...RECIPES, ...INGREDIENTS, 'line-row__hint', 'chip', 'confirm-dialog__body'])
    for (const file of sources) {
      const text = readSource(file)
      expect(text, file).not.toBe('')
      for (const m of text.matchAll(/className="([^"]+)"/g)) for (const c of m[1]!.split(/\s+/).filter((x) => !x.startsWith('chip'))) expect(known.has(c), `${file}: .${c}`).toBe(true)
    }
  })
})

describe('Bento: tokens, no loose pixels, no hard-coded colour', () => {
  const rules = [...RECIPES.flatMap((n) => bodies(recipesCss, n)), ...INGREDIENTS.flatMap((n) => bodies(ingredientsCss, n))]
  it('has the rules to check', () => expect(rules.length).toBeGreaterThan(RECIPES.length))
  it('uses spacing tokens, not pixel gaps, margins or padding', () => {
    for (const body of rules) expect(body).not.toMatch(/(gap|margin[a-z-]*|padding[a-z-]*):\s*[^;]*\d+px/)
  })
  it('uses colour tokens, never a hex, rgb or hsl colour', () => {
    for (const body of rules) expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
  })
  it('rounds with the radius tokens', () => {
    for (const body of rules) if (/border-radius/.test(body)) expect(body).toMatch(/border-radius:\s*var\(--radius-/)
  })
})

describe('Base recipe picker rows', () => {
  const row = bodies(recipesCss, 'picker-row').join(' ')
  it('are 44 px tap targets laid out as a row, with the Bento tile radius', () => {
    expect(row).toMatch(/min-(block-size|height):\s*(44px|var\(--tap)/)
    expect(row).toMatch(/display:\s*(flex|grid)/)
    expect(row).toMatch(/border-radius:\s*var\(--radius-(tile-sm|control)\)/)
  })
  it('read as disabled when aria-disabled, with the reason in the muted colour', () => {
    expect(recipesCss).toMatch(/\.picker-row\[aria-disabled=["']?true["']?\]/)
    expect(bodies(recipesCss, 'picker-row__reason').join(' ')).toMatch(/color:\s*var\(--color-(muted|soft)\)/)
  })
  it('show the selected or focused row with a tonal surface', () => {
    expect(recipesCss).toMatch(/\.picker-row(\[aria-selected=["']?true["']?\]|:hover|:focus-visible|\[data-active)/)
    expect(recipesCss).toMatch(/\.picker-row[^{]*\{[^}]*background(-color)?:\s*var\(--color-(surface-2|accent[a-z-]*)\)/)
  })
  it('keep the list scrollable inside the sheet without a fixed pixel height', () => {
    const list = bodies(recipesCss, 'picker-list').join(' ')
    expect(list).toMatch(/overflow(-y)?:\s*auto/)
    expect(list).not.toMatch(/(?<![a-z-])(block-size|height):\s*\d+px/)
  })
})

describe('Needed at chip-menu', () => {
  it('is a pill like the other chips', () => {
    expect(bodies(recipesCss, 'needed-at__trigger').join(' ')).toMatch(/border-radius:\s*var\(--radius-chip\)/)
  })
  it('has a menu surface raised from the page', () => {
    expect(bodies(recipesCss, 'needed-at__menu').join(' ')).toMatch(/background(-color)?:\s*var\(--color-surface/)
  })
})

describe('Link candidate rows', () => {
  it('give each row a 44 px target and mute the archived tag', () => {
    expect(bodies(recipesCss, 'link-candidate').join(' ')).toMatch(/min-(block-size|height):\s*(44px|var\(--tap)/)
    expect(bodies(recipesCss, 'link-candidate__archived').join(' ')).toMatch(/color:\s*var\(--color-(muted|soft)\)/)
  })
})

describe('Select badge and Base recipe tile', () => {
  it('keeps the badge a pill that does not shrink the label', () => {
    const b = bodies(selectCss, 'select__badge').join(' ')
    expect(b).toMatch(/border-radius:\s*var\(--radius-chip\)/)
    expect(b).toMatch(/flex-shrink:\s*0|justify-self|inline-/)
  })
  it('the Yield line on a tile uses the meta type scale', () => {
    expect(bodies(recipesCss, 'recipe-tile__yield').join(' ')).toMatch(/font-size:\s*var\(--text-meta-size\)/)
  })
})
