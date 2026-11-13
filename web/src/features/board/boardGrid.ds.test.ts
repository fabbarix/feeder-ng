// DS-A round 2 (ADR 0016): the kitchen board keeps its fixed 4 x 3 wall grid as its own `.board-grid`, not a borrowed `.bento-grid`
// (BentoGrid's auto-fill tracks and its "a span-2 tile takes one track" rule would otherwise reach the wall display).
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/board/board.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const screen = readFileSync(`${cwd}/src/features/board/screens/BoardScreen.tsx`, 'utf8')

describe('board grid', () => {
  it('BoardScreen renders a board-grid, not a bento-grid', () => {
    expect(screen).toMatch(/className="board-grid"/)
    expect(screen).not.toMatch(/bento-grid/)
  })
  it('board.css styles .board-grid as a grid with the Bento gap, and never mentions .bento-grid', () => {
    const r = css.slice(css.indexOf('.board-screen .board-grid {'))
    expect(r.slice(0, r.indexOf('}'))).toMatch(/display:\s*grid/)
    expect(css).not.toMatch(/\.bento-grid/)
  })
})
