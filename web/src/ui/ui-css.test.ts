// Per-component stylesheets (plan 7 WP3): tokens only. Mirrors the check-ui guards (sizing, colour-literals)
// so a violation fails vitest as well as scripts/check-ui.sh.
import { describe, expect, it } from 'vitest'
import { readAllUiCss, readStylesCss, ruleBlocks } from './test-utils'

const EXPECTED = [
  'BentoGrid.css',
  'Button.css',
  'Chip.css',
  'EmptyState.css',
  'IconButton.css',
  'ListRow.css',
  'PageHeader.css',
  'ProgressTile.css',
  'RecipeThumb.css',
  'Tile.css',
  'TimerTile.css',
]

const files = readAllUiCss()
const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('ui/*.css', () => {
  it('has one stylesheet per primitive', () => {
    for (const name of EXPECTED) expect(Object.keys(files), name).toContain(name)
  })

  it.each(EXPECTED)('%s: no px font sizes (use the --text-* tokens)', (name) => {
    expect(code(files[name] ?? '')).not.toMatch(/font-size\s*:[^;]*\d+(\.\d+)?px/)
    expect(code(files[name] ?? '')).not.toMatch(/font\s*:[^;]*\d+(\.\d+)?px/)
  })

  it.each(EXPECTED)('%s: no colour literals (use var(--...))', (name) => {
    expect(code(files[name] ?? '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab)\(/)
  })

  it.each(EXPECTED)('%s: reduced motion drops transforms or the file animates nothing', (name) => {
    const css = code(files[name] ?? '')
    if (/animation\s*:|@keyframes/.test(css)) expect(css).toMatch(/prefers-reduced-motion/)
  })

  it('Tile.css has no min-height on any tile variant', () => {
    expect(code(files['Tile.css'] ?? '')).not.toMatch(/min-(block-size|height)/)
  })

  it('styles.css has a single light palette block, `:root, [data-scheme=light]`', () => {
    // the OS-dark fallback is `:root:not([data-scheme='light'])` (inside a media query): not a light block
    const light = ruleBlocks(readStylesCss()).filter((b) => /--color-bg\s*:/.test(b.body) && !b.selectors.some((s) => /dark|:not\(/.test(s)))
    expect(light).toHaveLength(1)
    expect(light[0]!.selectors).toEqual([':root', "[data-scheme='light']"])
  })

  it('styles.css no longer holds the moved component rules', async () => {
    const nodeFs = 'node:fs'
    const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
    const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
    const css = code(readFileSync(`${cwd}/src/styles.css`, 'utf8'))
    for (const sel of ['.tile', '.chip', '.button', '.bento-grid', '.empty-state', '.progress-tile', '.timer-tile']) {
      expect(css, sel).not.toMatch(new RegExp(`(^|[\\s,}])${sel.replace('.', '\\.')}[\\s,{:\\[_.-]`))
    }
  })
})
