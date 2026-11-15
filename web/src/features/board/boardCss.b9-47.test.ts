// B9-47 (TB-04, TB-07, TB-08, SHORT-03, RES-09): board.css at wall scale. Mocks: docs/design/ui-review-3/mocks/tb-board.html and
// short-03-board-landscape.html (their `<style data-proposed>`). The board type is the --text-board-* roles; control sizes are --board-control,
// --board-chip and --text-board-control; the layouts are wall, portrait (orientation) and scroll (short landscape).
import { describe, expect, it } from 'vitest'
import { boardRules, bodyOf, rulesMatching, rulesOf } from './cssRules'

const rules = boardRules()
const decl = (body: string, prop: string) => new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+)`).exec(body)?.[1]?.trim() ?? ''

describe('board.css: type is the board roles (TB-07), with no fixed heights', () => {
  it('every font-size is a --text-board-* role, or sized from the cell with container-query units (the clock)', () => {
    const bad: string[] = []
    for (const r of rules) {
      for (const m of r.body.matchAll(/(?:^|[;\s])font-size:\s*([^;]+)/g)) {
        const value = m[1]!.trim()
        if (!/--text-board-|cq[iwhb]/.test(value)) bad.push(`${r.selectors[0]}: ${value}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('no rule sets a height in rem (the old .board-next__text 4.2rem and .board-next__recipe 1.75rem are gone)', () => {
    const bad = rules.filter((r) => /(?:^|[;\s])(?:min-)?height:\s*[\d.]+rem/.test(r.body)).map((r) => r.selectors[0])
    expect(bad.filter((s) => s !== '.board-cell')).toEqual([]) // the phone cell keeps its 9 rem minimum height (L-10)
  })
  it('the hero Recipe name is --text-board-hero at weight 700 (not 800), two lines then an ellipsis', () => {
    const body = bodyOf('.board-tonight__recipe')
    expect(decl(body, 'font-size')).toBe('var(--text-board-hero)')
    expect(decl(body, 'font-weight')).toBe('700')
    expect(body).toMatch(/-webkit-line-clamp:\s*2/)
    expect(body).toMatch(/overflow:\s*hidden/)
  })
  it('the Course rows: the main one at the hero role, the others at --text-board-title (never below the slot line)', () => {
    expect(decl(bodyOf(".board-tonight__course[data-main='true']"), 'font-size')).toBe('var(--text-board-hero)')
    expect(decl(bodyOf('.board-tonight__course'), 'font-size')).toBe('var(--text-board-title)')
    expect(decl(bodyOf('.board-tonight__slot'), 'font-size')).toMatch(/--text-board-meta/)
  })
  it('a Cooked Course row is the hero\'s text colour at 70 %, never an opacity fade (B9-08, TB-05)', () => {
    const body = bodyOf(".board-tonight__course[data-state='cooked']")
    expect(body).toMatch(/color:\s*color-mix\(in srgb, currentColor 70%, transparent\)/)
    expect(body).not.toMatch(/opacity/)
  })
  it('Next Advance Step: the Step text is --text-board-title at 600, two lines; the Recipe line is --text-board-meta on one line', () => {
    const text = bodyOf('.board-next__text')
    expect(decl(text, 'font-size')).toBe('var(--text-board-title)')
    expect(decl(text, 'font-weight')).toBe('600')
    expect(text).toMatch(/-webkit-line-clamp:\s*2/)
    const recipe = bodyOf('.board-next__recipe')
    expect(decl(recipe, 'font-size')).toBe('var(--text-board-meta)')
    expect(recipe).toMatch(/text-overflow:\s*ellipsis/)
    expect(recipe).toMatch(/white-space:\s*nowrap|-webkit-line-clamp:\s*1/)
  })
  it('headings are --text-board-heading; the streak is --text-board-metric', () => {
    expect(decl(bodyOf('.board-tile__heading'), 'font-size')).toBe('var(--text-board-heading)')
    expect(decl(bodyOf('.board-streak__days'), 'font-size')).toBe('var(--text-board-metric)')
  })
  it('the list rows are the board roles: a title (bold, one line, ellipsis) over a meta line', () => {
    const title = bodyOf('.board-list__title')
    expect(title).toMatch(/text-overflow:\s*ellipsis/)
    expect(title).toMatch(/white-space:\s*nowrap/)
    expect(decl(bodyOf('.board-list__meta'), 'font-size')).toBe('var(--text-board-meta)')
  })
  it('Tomorrow\'s lines are one line each, ending in an ellipsis (the full text is in title)', () => {
    const lines = rulesMatching('.board-list--lines').map((r) => r.body).join(' ')
    expect(lines).toMatch(/white-space:\s*nowrap/)
    expect(lines).toMatch(/overflow:\s*hidden/)
    expect(lines).toMatch(/text-overflow:\s*ellipsis/)
  })
})

describe('board.css: the hero\'s eyebrow is Today\'s, at board scale (TB 7, TB-15b)', () => {
  it('a wrapping flex row at --text-board-heading; each part is nowrap, so it wraps only between parts', () => {
    const row = bodyOf('.board-eyebrow')
    expect(row).toMatch(/display:\s*flex/)
    expect(row).toMatch(/flex-wrap:\s*wrap/)
    expect(row).toMatch(/column-gap:\s*0?\.4em/)
    expect(decl(row, 'font-size')).toBe('var(--text-board-heading)')
    expect(bodyOf('.board-eyebrow__part')).toMatch(/white-space:\s*nowrap/)
  })
})

describe('board.css: sizes of the controls (TB-04, TB-07)', () => {
  it('Close is a circle of --board-control, a transparent fill, a 1 px --color-outline boundary, never squashed', () => {
    const body = bodyOf('.board-close')
    expect(body).toMatch(/border-radius:\s*(50%|999px)/)
    expect(body).toMatch(/flex:\s*none/)
    expect(body).toMatch(/(?:inline-size|width):\s*(var\(--board-control\)|max\(56px, calc\(3\.5 \* var\(--board-unit\)\)\))/)
    expect(body).toMatch(/(?:block-size|height):\s*(var\(--board-control\)|max\(56px, calc\(3\.5 \* var\(--board-unit\)\)\))/)
    expect(body).toMatch(/background:\s*transparent/)
    expect(body).toMatch(/(?:border:\s*1px solid var\(--color-outline\)|box-shadow:\s*inset 0 0 0 1px var\(--color-outline\))/)
    expect(body).toMatch(/color:\s*var\(--color-text\)/)
  })
  it('Close sits 5 px inside the tile padding, so its ring is not cut (R-C)', () => {
    expect(bodyOf('.board-close')).toMatch(/margin[^;]*\b5px\b|--board-inset/)
  })
  it('the X is 45 % of the button', () => {
    expect(bodyOf('.board-close svg')).toMatch(/(?:width|inline-size):\s*45%/)
  })
  it('Close dims to 45 % when idle, and in reduced motion the change is at once (no transition)', () => {
    expect(bodyOf(".board-close[data-idle='true']")).toMatch(/opacity:\s*0?\.45/)
    const reduced = rules.filter((r) => r.at.some((a) => /prefers-reduced-motion:\s*reduce/.test(a)) && r.selectors.includes('.board-close'))
    expect(reduced.map((r) => r.body).join(' ')).toMatch(/transition:\s*none/)
  })
  it('the date and the Close control share the clock\'s top row; the time is sized from the cell\'s width and height (cqi and cqh)', () => {
    const top = bodyOf('.board-clock__top')
    expect(top).toMatch(/display:\s*flex/)
    expect(top).toMatch(/justify-content:\s*space-between/)
    const time = rulesOf('.board-clock__time').map((r) => decl(r.body, 'font-size')).filter(Boolean).pop() ?? ''
    expect(time).toMatch(/55cqh/)
    expect(time).toMatch(/100cqi/)
  })
  it('Done is at least --board-control high, in --text-board-control (a secondary lg button, R-A)', () => {
    const body = rulesMatching('.board-next__done').map((r) => r.body).join(' ')
    expect(body).toMatch(/min-height:\s*var\(--board-control\)/)
    expect(body).toMatch(/font-size:\s*var\(--text-board-control\)/)
  })
  it('Cook is at least max(76px, 4.75 board units) high', () => {
    const body = rulesMatching('.board-tonight__cook').map((r) => r.body).join(' ')
    expect(body).toMatch(/min-height:\s*max\(76px, calc\(4\.75 \* var\(--board-unit\)\)\)/)
  })
  it('chips (Use soon, Next Advance Step, Tomorrow) are --board-chip high with --text-board-control labels', () => {
    for (const part of ['.board-use-soon .chip', '.board-next .chip']) {
      const body = rulesMatching(part).map((r) => r.body).join(' ')
      expect(body, part).toMatch(/block-size:\s*var\(--board-chip\)/)
      expect(body, part).toMatch(/font-size:\s*var\(--text-board-control\)/)
    }
    expect(rulesMatching('.board-tomorrow .chip').map((r) => r.body).join(' ')).toMatch(/block-size:\s*var\(--board-chip\)/)
  })
  it('Next Advance Step has a foot row that holds the due state and Done on one line', () => {
    const foot = bodyOf('.board-next__foot')
    expect(foot).toMatch(/display:\s*flex/)
    expect(foot).toMatch(/margin-top:\s*auto|margin-block-start:\s*auto/)
  })
})

describe('board.css: the layouts (TB-07, SHORT-03)', () => {
  const wide = (a: string) => /min-width:\s*(37\.5em|600px)/.test(a)
  /** the rules inside the short-landscape query: from 600 px wide, up to 559 px high */
  const scroll = () => rules.filter((r) => r.at.some((a) => wide(a) && /max-height:\s*(559px|34\.9\d*em|35em)/.test(a)))
  const scrollBody = (selector: string) => scroll().filter((r) => r.selectors.includes(selector)).map((r) => r.body).join(' ')

  it('the screen is padded by the board unit (--board-pad)', () => {
    expect(bodyOf('.board-screen')).toMatch(/padding:[^;]*--board-pad/)
  })
  it('the wall grid (from 600 px wide): 4 columns, 3 rows of the screen\'s height less the padding', () => {
    const wall = rules.filter((r) => r.selectors.includes('.board-screen .board-grid') && r.at.some((a) => wide(a) && !/max-height|orientation/.test(a)))
    expect(wall.length).toBeGreaterThan(0)
    const body = wall.map((r) => r.body).join(' ')
    expect(body).toMatch(/grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
    expect(body).toMatch(/grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)/)
    expect(body).toMatch(/height:\s*calc\(100d?vh - 2 \* var\(--board-pad\)\)/)
  })
  it('below 560 px of height (a phone held sideways) the wall grid gives way: rows take their content height, at least 8 rem, and the board scrolls', () => {
    const body = scrollBody('.board-screen .board-grid')
    expect(body).toMatch(/grid-auto-rows:\s*minmax\(8rem, auto\)/)
    expect(body).toMatch(/grid-template-rows:\s*none/)
    expect(body).toMatch(/(?:^|[;\s])height:\s*auto/)
  })
  it('there the padding is the larger of --space-4 and the safe inset on each side', () => {
    const body = scrollBody('.board-screen')
    expect(body).toMatch(/max\(var\(--space-4\), var\(--safe-top\)\)/)
    expect(body).toMatch(/max\(var\(--space-4\), var\(--safe-left\)\)/)
  })
  it('there the tiles stop clipping', () => {
    expect(scrollBody('.board-cell > .tile-boundary > .tile')).toMatch(/overflow:\s*visible/)
  })
  it('there Cook follows the slot line (space-4 above it, 64 px tall), so it is at first view', () => {
    const body = scroll().filter((r) => r.selectors.some((s) => s.includes('.board-tonight__cook'))).map((r) => r.body).join(' ')
    expect(body).toMatch(/margin-block-start:\s*var\(--space-4\)/)
    expect(body).toMatch(/min-height:\s*64px/)
  })
  it('the portrait layout (a portrait tablet, 600 px and wider): 2 columns, five rows 2fr 1.3fr 1fr 0.7fr 1fr, one screen', () => {
    const portrait = rules.filter((r) => r.selectors.some((s) => s.includes('.board-grid')) && r.at.some((a) => /orientation:\s*portrait/.test(a) && wide(a)))
    expect(portrait.length).toBeGreaterThan(0)
    const body = portrait.map((r) => r.body).join(' ')
    expect(body).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
    expect(body).toMatch(/grid-template-rows:\s*2fr 1\.3fr 1fr 0\.7fr 1fr/)
  })
})

describe('board.css: a tile sits inside its TileErrorBoundary (RES-09)', () => {
  it('the tile rule reaches through the boundary: .board-cell > .tile-boundary > .tile, and not the old direct child', () => {
    expect(rulesOf('.board-cell > .tile-boundary > .tile').length).toBeGreaterThan(0)
    expect(rules.some((r) => r.selectors.includes('.board-cell > .tile'))).toBe(false)
  })
  it('a crashed tile fills its cell, so the grid does not jump', () => {
    const body = rulesMatching('.board-cell > .tile-boundary > .tile-error').map((r) => r.body).join(' ')
    expect(body).toMatch(/(?:block-size|height):\s*100%/)
  })
})
