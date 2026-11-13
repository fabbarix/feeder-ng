// R2-4 L-10: board.css is 2 columns by default and becomes the 4 x 3 wall grid from 600 px. DS-A round 2: its own .board-grid, not a
// borrowed .bento-grid (ADR 0016: the BentoGrid tracks and its no-status-span rule must not reach the wall grid).
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/board/board.css`, 'utf8')

const at = css.indexOf('@media (min-width: 600px)')
const base = at < 0 ? css : css.slice(0, at)
const wall = at < 0 ? '' : css.slice(at)
const rule = (text: string, selector: string) => {
  const start = text.indexOf(`${selector} {`)
  return start < 0 ? '' : text.slice(start, text.indexOf('}', start) + 1).replace(/\s+/g, ' ')
}

describe('board.css phone grid', () => {
  it('has a 600 px block', () => {
    expect(at).toBeGreaterThan(-1)
  })
  it('the default grid is 2 columns with content-height rows', () => {
    const r = rule(base, '.board-screen .board-grid')
    expect(r).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
    expect(r).not.toMatch(/height:\s*calc\(100vh/)
    expect(r).not.toMatch(/grid-template-rows:\s*repeat\(3/)
  })
  it('from 600 px it is the 4 x 3 grid at screen height', () => {
    const r = rule(wall, '  .board-screen .board-grid')
    expect(r).toMatch(/grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
    expect(r).toMatch(/grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)/)
    expect(r).toMatch(/height:\s*calc\(100vh - 48px\)/)
  })
  it('a phone tile has a readable minimum height (the clock does not clip)', () => {
    expect(rule(base, '.board-cell')).toMatch(/min-height:\s*\d+(\.\d+)?rem/)
  })
})

const clockAt = css.indexOf('.board-clock__date {')
const clockWallAt = css.indexOf('@media (min-width: 600px)', clockAt)
const clockBase = css.slice(0, clockWallAt)
const clockWall = css.slice(clockWallAt)

describe('board.css clock tile on a phone (R2-4 review: "Wednesda" and "Novembe" were clipped at 390)', () => {
  it('below 600 px the clock is sized to its cell, not to a fixed rem, and the date wraps', () => {
    expect(rule(clockBase, '.board-clock__time')).toMatch(/font-size:\s*(1\d|2[0-5])cqi/)
    const date = rule(clockBase, '.board-clock__date')
    expect(date).toMatch(/font-size:\s*\d+(\.\d+)?cqi/)
    expect(date).not.toMatch(/font-size:\s*[\d.]+rem/)
    expect(date).toMatch(/overflow-wrap:\s*(anywhere|break-word)/)
  })
  it('from 600 px the wall clock keeps its big sizes', () => {
    expect(rule(clockWall, '  .board-clock__time')).toMatch(/font-size:\s*32cqi/)
    expect(rule(clockWall, '  .board-clock__date')).toMatch(/font-size:\s*2rem/)
  })
})

describe('board.css Timers tile (L5: labels were cut with no ellipsis at 390)', () => {
  it('lets the timer list shrink to the tile and ellipsises the label', () => {
    expect(css).toMatch(/\.board-timers \.board-list \{\s*grid-template-columns:\s*minmax\(0, 1fr\)/)
    expect(css).toMatch(/\n\.board-timers \.timer-tile \.tile__overline \{\s*min-width:\s*0/)
    const label = rule(css, '.board-timers .timer-tile__label')
    expect(label).toMatch(/text-overflow:\s*ellipsis/)
    expect(label).toMatch(/white-space:\s*nowrap/)
  })
})
