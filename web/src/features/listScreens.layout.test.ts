// IH: every list screen composes the shared ListPage (token gap between header, search and list) instead of its own root markup.
import { describe, expect, it } from 'vitest'

// vitest blanks CSS imports (even ?raw), so the stylesheet is read from disk; vitest runs in web/.
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const stockCss = readFileSync('src/features/stock/stock.css', 'utf8')

const raw = {
  ...(import.meta.glob(['./**/screens/*Screen.tsx', '!./**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
}
const src = (p: string) => (raw[p] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SCREENS = [
  './ingredients/screens/IngredientsScreen.tsx',
  './products/screens/ProductsScreen.tsx',
  './shops/screens/ShopsScreen.tsx',
  './stock/screens/StoragePlacesScreen.tsx',
  './recipes/screens/RecipesScreen.tsx',
]

describe('list screens use the shared ListPage', () => {
  it.each(SCREENS)('%s composes <ListPage', (p) => {
    expect(src(p), p).toMatch(/<ListPage\b/)
  })

  it.each(SCREENS)('%s has no ad-hoc root (div.pg, bare <section>, <div|section className="recipes-screen">)', (p) => {
    const t = src(p)
    expect(t, p).not.toMatch(/className="pg"/)
    expect(t, p).not.toMatch(/<section[\s>]/)
    expect(t, p).not.toMatch(/<(div|section)\b[^>]*className="recipes-screen"/)
  })

  it('Recipes keeps its CSS scope class on ListPage (recipes.css scopes the 3/4-column grid on .recipes-screen)', () => {
    expect(src('./recipes/screens/RecipesScreen.tsx')).toMatch(/<ListPage\b[^>]*className="recipes-screen"/)
  })

  it.each(['./ingredients/screens/IngredientsScreen.tsx', './products/screens/ProductsScreen.tsx'])(
    '%s hands the SearchField to ListPage as its search slot',
    (p) => {
      expect(src(p), p).toMatch(/search=\{\s*<SearchField\b/)
    },
  )

  // hf-recipes-filter: Recipes' search slot is row 1 of its filter header, the SearchField with the Filters button beside it
  // (docs/design/recipes-filter.md 3); the SearchField is still in the search slot.
  it('./recipes/screens/RecipesScreen.tsx hands ListPage a search slot whose row holds the SearchField, then the Filters button', () => {
    const t = src('./recipes/screens/RecipesScreen.tsx')
    expect(t).toMatch(/search=\{\s*(<>\s*)?<div className="filter-bar__row filter-bar__search-row">\s*<SearchField\b[^>]*\/>\s*<FiltersButton\b/)
  })

  it('the Stock screen (search in its aside) keeps a token gap', () => {
    expect(stockCss.replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(/\.stock-screen\s*\{[^}]*gap:\s*var\(--space-[3-6]\)/)
  })
})
