// WP7 guard: the Shop and Scan folders contain no native browser UI, no legacy primitive props, no glyph characters
// standing in for icons and no dash for "no value" (CLAUDE.md "No native browser UI", ui-fix-plan 4/5.5/5.6/6).
// Reads the production sources from disk (test files are skipped).
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readdirSync, readFileSync, statSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readdirSync: (p: string) => string[]
  readFileSync: (p: string, enc: string) => string
  statSync: (p: string) => { isDirectory(): boolean }
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && name !== 'testData.ts' ? [path] : []
  })
}

function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const files = [...walk(`${cwd}/src/features/shop`), ...walk(`${cwd}/src/features/scan`)]

const forbidden: [string, RegExp][] = [
  ['native <select>', /<select\b/],
  ['native <input> or <textarea> (use TextField / NumberField / SearchField / Checkbox)', /<(input|textarea)\b/],
  // a call, bare or window.-qualified (not a member such as feedback.confirm(), nor a method declaration `confirm(): void`)
  ['native alert/confirm/prompt', /(?<![\w$.])(window\.)?(alert|confirm|prompt)\((?!\)\s*(:|\{))/],
  ['legacy Button variant tonal/ghost', /variant=["'](tonal|ghost)["']/],
  ['legacy Chip/Tile tone prop', /(?<![-\w])tone=/],
  ['legacy Tile size prop', /<Tile\b[^>]*\ssize=/],
  ['legacy EmptyState illustration', /illustration=/],
  // a pencil glyph anywhere, and a close glyph standing alone: a whole string literal ({'×'}, "×", aria-label="×") or JSX
  // text on its own (>×<). The multiplication sign inside longer text ("2 × Mutti 700 g") is not an icon.
  ['glyph characters instead of icons (pencil)', /✎/],
  ['glyph characters instead of icons (x)', /(['"`])\s*×\s*\1|>\s*×\s*</],
  ['a dash for "no value"', /—/],
  ['Phosphor imported outside ui/', /@phosphor-icons/],
  ['inline <svg>', /<svg\b/],
]

describe('WP7 sources', () => {
  it('finds the production sources', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  for (const [name, pattern] of forbidden) {
    it(`no ${name}`, () => {
      const hits = files.filter((f) => pattern.test(code(f))).map((f) => f.replace(`${cwd}/`, ''))
      expect(hits).toEqual([])
    })
  }
})
