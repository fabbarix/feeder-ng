// B9-29 (SHORT-07, the one rule in features/stock/stock.css): inside a Filters sheet on a short viewport a long list drops its own cap,
// so the sheet is the one scroll container (no scroll inside a scroll). ui/FilterBar/FilterBar.css already does it for `.sheet
// .filter-panel__list [role=listbox]` under (max-height: 499px); the Pantry's own, narrower cap (min(16rem, 40dvh), more specific) is
// scoped out the same way. jsdom does not lay out; the guard's pantry-filter scenario at 844x390 checks the real page.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(resolve(cwd, 'src/features/stock/stock.css'), 'utf8')

/** The body of the first `@media <query> { ... }` block whose header contains `query`, braces balanced. */
function mediaBlock(source: string, query: string): string | null {
  const at = source.indexOf(`@media ${query}`)
  if (at < 0) return null
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  return null
}

describe('the Pantry Filters list in a short sheet', () => {
  it('keeps its cap on a tall popover', () => {
    expect(css).toMatch(/\.pantry-filters__panel \.filter-panel__list \[role='listbox'\]\s*\{[^}]*max-block-size:\s*min\(16rem, 40dvh\)/)
  })
  it('drops the cap and the inner scroll inside a sheet on a short viewport (max-height: 499px)', () => {
    const block = mediaBlock(css, '(max-height: 499px)')
    expect(block, 'stock.css needs a (max-height: 499px) block for the Pantry Filters sheet').not.toBeNull()
    // as specific as the Pantry's own cap (it names .pantry-filters__panel), however the sheet wraps the panel
    expect(block).toMatch(/\.pantry-filters__panel[^{]*\[role='listbox'\]\s*\{[^}]*max-block-size:\s*none/)
    expect(block).toMatch(/overflow:\s*visible/)
  })
})
