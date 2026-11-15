// SET-08 (and the known defects of the sweep): the Meal Slot card CSS contract. vitest blanks CSS imports, so the file is read as text.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/settings/mealSlotCards.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s: string) => s.replace(/\s+/g, ' ')

/** The declaration block text of every top-level rule whose selector list contains `selector` exactly. */
function body(selector: string): string {
  const out: string[] = []
  const flat = css.replace(/@[a-z-]+[^{;]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '') // at-rule blocks (one nesting level) are read by container() / the @media tests
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.split(',').map((x) => norm(x).trim()).includes(selector)) out.push(norm(m[2]!))
  }
  return out.join(' ')
}
const container = (query: string) => {
  const i = css.search(new RegExp(`@container\\s*\\(${query}\\)`))
  if (i < 0) return ''
  let depth = 0
  let start = css.indexOf('{', i)
  for (let j = start; j < css.length; j++) {
    if (css[j] === '{') depth++
    if (css[j] === '}' && --depth === 0) return norm(css.slice(start + 1, j))
  }
  return ''
}

describe('mealSlotCards.css: the card is a container (SET-08)', () => {
  it('.ms-card is an inline-size container, so the strip answers to the card, not the viewport', () => {
    expect(body('.ms-card')).toMatch(/container(-type)?:\s*([\w-]+ \/ )?inline-size/)
  })
  it('below a 22 rem card the day cells show no time (the dot and the "Differs on" list carry it)', () => {
    expect(container('max-width:\\s*22rem')).toMatch(/\.ms-day__time\s*\{\s*display:\s*none/)
  })
  it('a day cell is at least 44 px high', () => {
    expect(body('.ms-day')).toMatch(/min-block-size:\s*44px/)
  })
  it('the clock keeps weight 600, not 800', () => {
    expect(body('.ms-card__clock')).toMatch(/font-weight:\s*600/)
  })
  it('the foot buttons are 44 px high on a coarse pointer', () => {
    expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{[^}]*\.ms-card__foot\s+\.button[^}]*min-block-size:\s*44px/)
  })
  it('the foot buttons share a row and wrap (each takes a line in a 248 px card)', () => {
    expect(body('.ms-card__foot')).toMatch(/flex-wrap:\s*wrap/)
  })
})

// Known defect (sweep): at 375 and 390 "08:30" overflowed its pill. The cell is a flex column that may shrink to its track, never wider.
describe('mealSlotCards.css: a cell never lets its time overflow its pill', () => {
  it('the cell and its time can shrink (min-inline-size 0) and the time never wraps outside the pill', () => {
    expect(body('.ms-day')).toMatch(/min-inline-size:\s*0/)
    expect(body('.ms-day__time')).toMatch(/white-space:\s*nowrap/)
  })
  it('the time is muted by its colour at full opacity', () => {
    const b = body('.ms-day__time')
    expect(b).not.toMatch(/opacity:\s*0?\.\d/)
  })
})

// Known defect (sweep): the "differs" dot sat on the weekday name. It is drawn in the cell's corner, off the text (the page-layout scenario
// `meal-slots-cards` measures that the dot never overlaps the weekday or the time).
describe('mealSlotCards.css: the "differs" dot', () => {
  it('is a small circle pinned to a corner of the cell', () => {
    const b = body('.ms-day[data-differs]::after')
    expect(b).toMatch(/border-radius:\s*50%/)
    expect(b).toMatch(/position:\s*absolute|inset-block-start/)
    expect(b).toMatch(/inline-size:\s*(6|7|8)px/)
  })
})

// Known defect (sweep): the Avatar stack overlapped so far that a name could not be told from its neighbour.
describe('mealSlotCards.css: the Avatar stack', () => {
  it('overlaps by a quarter of an avatar at most (not --space-2 of 28 px) and rings each avatar in the card\'s own surface', () => {
    const b = body('.ms-stack__item + .ms-stack__item') + ' ' + body('.ms-stack__more')
    expect(b).toMatch(/margin-inline-start:\s*calc\(-1 \* var\(--space-1\)\)/)
    expect(body('.ms-stack__item')).toMatch(/box-shadow:\s*0 0 0 2px var\(--color-surface\)/)
  })
})

describe('mealSlotCards.css: the Removed Meal Slots tile (SET-15)', () => {
  it('the sentence is muted meta text', () => {
    const b = body('.rm-note')
    expect(b).toMatch(/color:\s*var\(--color-muted\)/)
    expect(b).toMatch(/font-size:\s*var\(--text-meta-size\)/)
  })
})
