// QA-1 (1.0.0-beta.4.1): at 820 px the Board's clock tile was clipped: the time touched the tile edge and "November" broke
// mid-word. The tile is 168-250 px wide at 768-1024 px, so the clock sizes to the cell (container query units) and the date
// wraps between words only.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/board/board.css`, 'utf8')

/** Every declaration block whose selector is exactly `selector`, with the media query it sits in ('' for none). */
function blocks(selector: string): { media: string; body: string }[] {
  const out: { media: string; body: string }[] = []
  const re = /(?:@media\s*([^{]+)\{\s*)?([^{}@]+)\{([^}]*)\}/g
  let media = ''
  for (const m of css.matchAll(re)) {
    if (m[1]) media = m[1].trim()
    if (m[2]!.trim() === selector) out.push({ media, body: m[3]!.replace(/\s+/g, ' ') })
  }
  return out
}
const all = (selector: string) => blocks(selector).map((b) => b.body).join(' ')
/** The font-size of the last block (the one that wins at a tablet width). */
const lastSize = (selector: string) => {
  const sizes = [...all(selector).matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]!.trim())
  return sizes[sizes.length - 1] ?? ''
}

describe('board.css: the clock tile at tablet widths (768-1024 px)', () => {
  it('the date never breaks inside a word: no overflow-wrap: anywhere, no word-break: break-all', () => {
    const date = all('.board-clock__date')
    expect(date).not.toBe('')
    expect(date).not.toMatch(/overflow-wrap:\s*anywhere/)
    expect(date).not.toMatch(/word-break:\s*break-all/)
  })

  it('the date size follows the cell width (cqi) and is capped at 2rem; it is not a fixed 2rem', () => {
    const size = lastSize('.board-clock__date')
    expect(size).toMatch(/cqi/)
    expect(size).toMatch(/^(min|clamp)\(/)
  })

  it('the time size leaves room for the tile padding: derived from the content width, not a bare share of the cell', () => {
    const size = lastSize('.board-clock__time')
    expect(size).toMatch(/calc\(/)
    expect(size).toMatch(/100cqi/)
    expect(size).not.toMatch(/^32cqi$/)
  })

  it('the clock tile does not clip its content: the time and date get the whole cell content box (min-width: 0)', () => {
    expect(all('.board-clock__time') + all('.board-clock__date') + all('.board-clock')).toMatch(/min-width:\s*0|max-width:\s*100%/)
  })
})
