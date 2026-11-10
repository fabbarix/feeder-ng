import { describe, expect, it } from 'vitest'

const raw = import.meta.glob(['./**/*.ts', './**/*.tsx', './**/*.css', '!./**/*.test.*', '!./testData.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
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
    const css = Object.entries(raw).filter(([f]) => f.endsWith('.css')).map(([, t]) => t).join('\n')
    const rule = /\.stock-sheet__fields\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/display:\s*(grid|flex)/)
    expect(rule).toMatch(/gap:\s*var\(--space-\d+\)/)
    for (const f of ['./components/AddLotSheet.tsx', './components/SetTotalSheet.tsx']) expect(read(f), f).toContain('stock-sheet__fields')
  })

  it('has no StockTile left', () => {
    expect(sources.some((f) => /StockTile/.test(f) || /StockTile/.test(read(f)))).toBe(false)
  })
})
