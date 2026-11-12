// CRS F review (spec 7.5, 11): the Tonight tile is read from across the kitchen, so its Course rows keep a legible scale.
// The main Course's row sits at (or near) the hero Recipe scale (.board-tonight__recipe, 3.25rem); the other rows are
// smaller but never below the "Dinner · 19:00" line (.board-tonight__slot, 1.75rem); a Cooked row is muted.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/board/board.css`, 'utf8')

/** The declaration block of the first rule whose selector text is exactly `selector` (whitespace-normalised). */
const rule = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  return m ? m[2]!.replace(/\s+/g, ' ') : ''
}
const rem = (block: string): number => {
  const m = /font-size:\s*([\d.]+)rem/.exec(block)
  return m ? Number(m[1]) : Number.NaN
}

const recipe = rem(rule('.board-tonight__recipe'))
const slotLine = rem(rule('.board-tonight__slot'))
const others = rem(rule('.board-tonight__course'))
const main = rem(rule(".board-tonight__course[data-main='true']"))

describe('board.css: the Tonight tile\'s Course rows', () => {
  it('reads the reference sizes from board.css', () => {
    expect(recipe).toBe(3.25)
    expect(slotLine).toBe(1.75)
  })

  it('the main Course row is at or near the hero Recipe scale: from 75% of it, never above it', () => {
    expect(main).toBeGreaterThanOrEqual(recipe * 0.75)
    expect(main).toBeLessThanOrEqual(recipe)
  })

  it('the other rows are smaller than the main row but at least the "Dinner · 19:00" line', () => {
    expect(others).toBeLessThan(main)
    expect(others).toBeGreaterThanOrEqual(slotLine)
  })

  it('a Cooked row is muted, with the muted colour token', () => {
    expect(rule(".board-tonight__course[data-state='cooked']")).toMatch(/color:\s*var\(--color-muted\)/)
  })
})
