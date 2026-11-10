import { describe, expect, it } from 'vitest'

// vitest blanks CSS (even with ?raw), so stock.css is read from disk with an untyped dynamic import of node:fs
// (@types/node is not installed), as web/src/ui/test-utils.ts does.
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/
const stockCss = readFileSync(`${cwd}/src/features/stock/stock.css`, 'utf8')

const raw: Record<string, string> = {
  ...(import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.*', '!./testData.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  './stock.css': stockCss,
}
const sources = Object.keys(raw)
const read = (f: string) => raw[f] ?? ''

describe('Stock feature hygiene (WP8)', () => {
  it('has no native controls, window dialogs or legacy Tile/Button/Chip props', () => {
    for (const f of sources) {
      const text = read(f)
      expect(text, f).not.toMatch(/<select|<option|type="date"|type="number"|type="search"|window\.(alert|confirm|prompt)|\balert\(|\bconfirm\(/)
      expect(text, f).not.toMatch(/variant="(tonal|ghost)"|\btone=|<Tile[^>]*\bsize=|illustration=/)
    }
  })

  it('uses tokens only: no colour literals and no --status-spoil-solid as a surface', () => {
    for (const f of sources.filter((s) => /\.(tsx|css)$/.test(s))) {
      const text = read(f)
      expect(text, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
      expect(text, f).not.toMatch(/background[^;]*status-spoil-solid/)
    }
  })

  it('does not import Phosphor directly', () => {
    for (const f of sources) expect(read(f), f).not.toMatch(/@phosphor-icons/)
  })

  it('stacks sheet fields with a token gap (.stock-sheet__fields)', () => {
    expect(stockCss.length).toBeGreaterThan(0)
    const rule = /\.stock-sheet__fields\s*\{([^}]*)\}/.exec(stockCss)?.[1] ?? ''
    expect(rule).toMatch(/display:\s*(grid|flex)/)
    expect(rule).toMatch(/gap:\s*var\(--space-\d+\)/)
    for (const f of ['./components/AddLotSheet.tsx', './components/SetTotalSheet.tsx']) expect(read(f), f).toContain('stock-sheet__fields')
  })

  it('has no StockTile left', () => {
    expect(sources.some((f) => /StockTile/.test(f) || /StockTile/.test(read(f)))).toBe(false)
  })
})
