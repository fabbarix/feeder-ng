// B9-27 CSS contract (jsdom does not lay out): RX-04 layout by the page's width, the hero, the Cook tile and bar, RX-05 lede, RX-13 metrics,
// RX-14 and R-E rows, SHORT-04 Cook bar. Real pixels are the page-layout scenario `recipe-detail-cook` and the reviewer's screens.
// The rules helper reads a container query `(min-width: Nrem)` as "the viewport at which the container is N rem wide" (a test about the rule,
// not the container), so 720 below is the 45 rem of the chapter.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'
import { rulesFor, valueFor } from './rules.test-helper'

const css = readSource('features/recipes/recipe-detail.css').replace(/\/\*[\s\S]*?\*\//g, '')
const FROM = 720 // 45rem
/** The text of every @media/@container block whose condition contains `needle`. */
const blocks = (needle: string): string => {
  const out: string[] = []
  let i = 0
  while ((i = css.indexOf(needle, i)) >= 0) {
    const open = css.indexOf('{', i)
    let depth = 1
    let j = open + 1
    while (j < css.length && depth > 0) depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0, j++
    out.push(css.slice(open + 1, j - 1))
    i = j
  }
  return out.join('\n')
}

describe('RX-04: one layout rule by the page\'s width (a container), not by viewport breakpoints', () => {
  it('.recipe-detail is the container named recipe-detail', () => {
    expect(valueFor('.recipe-detail', 'container', 0)).toBe('recipe-detail / inline-size')
  })
  it('is one column below 45 rem', () => {
    for (const w of [375, 600, FROM - 1]) {
      expect(valueFor('.recipe-detail__layout', 'display', w), `@${w}`).toBe('flex')
      expect(valueFor('.recipe-detail__layout', 'flex-direction', w), `@${w}`).toBe('column')
    }
  })
  it('is two columns from 45 rem: a side column of 17 to 22.5 rem and the Steps, aligned to the start', () => {
    for (const w of [FROM, 1024, 1280, 1440, 1920]) {
      expect(valueFor('.recipe-detail__layout', 'display', w), `@${w}`).toBe('grid')
      expect(valueFor('.recipe-detail__layout', 'grid-template-columns', w), `@${w}`).toBe('minmax(17rem, 22.5rem) minmax(0, 1fr)')
      expect(valueFor('.recipe-detail__layout', 'align-items', w), `@${w}`).toBe('start')
    }
  })
  it('the old 80em switch, the 360 px column and the sticky aside are gone', () => {
    expect(css).not.toMatch(/min-width:\s*80em/)
    expect(css).not.toMatch(/grid-template-columns:\s*360px/)
    for (const w of [0, FROM, 1024, 1280, 1920]) expect(valueFor('.recipe-detail__aside', 'position', w), `@${w}`).not.toBe('sticky')
    expect(css).not.toMatch(/position:\s*sticky/)
  })
  it('the columns keep the tiles\' gap, and both can shrink', () => {
    expect(valueFor('.recipe-detail__layout', 'gap', FROM)).toBe('var(--space-4)')
    expect(valueFor('.recipe-detail__aside', 'min-inline-size', 0)).toBe('0')
    expect(valueFor('.recipe-detail__main', 'min-inline-size', 0)).toBe('0')
  })
})

describe('RX-04: the hero shares its edges with the tiles', () => {
  it('has no 820 px cap and no centring: it fills its column', () => {
    expect(css).not.toMatch(/820px/)
    expect(valueFor('.recipe-detail__hero', 'max-inline-size', 0)).toBe('none')
    expect(valueFor('.recipe-detail__hero', 'margin-inline', 0)).toBe('0')
  })
  it('the Photo is 16:9 but never taller than 40 % of the viewport', () => {
    expect(valueFor('.recipe-detail__hero .tile__media', 'aspect-ratio', 0)).toBe('16 / 9')
    expect(valueFor('.recipe-detail__hero .tile__media', 'max-block-size', 0)).toMatch(/^40d?vh$/)
  })
  it('without a Photo the band is 4:1', () => {
    expect(valueFor(".recipe-detail__hero[data-photo='false'] .tile__media", 'aspect-ratio', 0)).toBe('4 / 1')
  })
})

describe('RX-04: the hero chip line is one fitted line with room for the focus ring', () => {
  const line = ".recipe-detail__hero .recipe-tags[data-fitted='true']"
  it('never wraps, and clips nothing but its own overflow (the fit hides what does not fit)', () => {
    expect(valueFor(line, 'flex-wrap', 0)).toBe('nowrap')
    expect(valueFor(line, 'overflow', 0)).toBe('hidden')
  })
  it('keeps 5 px of ring room on every side, taken back with an equal negative margin so the line does not move', () => {
    expect(valueFor(line, 'padding', 0)).toMatch(/^(5px|var\(--ring-room\))$/)
    expect(valueFor(line, 'margin', 0)).toMatch(/^-(5px|var\(--ring-room\))$|^calc\(-1 \* /)
  })
  it('the chips never shrink, so a chip is whole or hidden', () => {
    expect(valueFor(`${line} > li`, 'flex', 0)).toBe('none')
  })
  it('the "+N" chip is outlined: a boundary on the surface (R-A)', () => {
    const rule = rulesFor('.recipe-tags__more').map((r) => r.body).join(' ')
    expect(rule).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--color-outline\)/)
    expect(rule).toMatch(/background:\s*var\(--color-surface\)/)
  })
})

describe('RX-04: the Cook tile', () => {
  it('is a column of its heading and the entry; its heading is the title-3 role', () => {
    expect(valueFor('.recipe-cook', 'display', 0)).toBe('flex')
    expect(valueFor('.recipe-cook', 'flex-direction', 0)).toBe('column')
    const h = rulesFor('.recipe-cook__title').map((r) => r.body).join(' ')
    expect(h).toMatch(/font-size:\s*var\(--text-title-3-size\)/)
    expect(h).toMatch(/line-height:\s*var\(--text-title-3-line\)/)
    expect(h).toMatch(/font-weight:\s*var\(--text-title-3-weight\)/)
    expect(h).toMatch(/margin:\s*0/)
  })
  it('stacks its entry (stepper over a full-width button) in the tile only', () => {
    expect(valueFor('.recipe-cook .cook-entry', 'flex-direction', 0)).toBe('column')
    expect(valueFor('.recipe-cook .cook-entry', 'align-items', 0)).toBe('stretch')
  })
})

describe('SHORT-04: the Cook entry in the bar is one row at every width', () => {
  it('is a row that never wraps, at every width (the old 80em column rule is gone)', () => {
    for (const w of [375, 390, 834, 1023, 1440]) {
      expect(valueFor('.cook-entry', 'flex-wrap', w), `@${w}`).toBe('nowrap')
      expect(valueFor('.cook-entry', 'flex-direction', w) ?? 'row', `@${w}`).toBe('row')
    }
  })
  it('the stepper keeps its size and the button takes the rest', () => {
    expect(valueFor('.cook-entry__batches', 'flex', 0)).toBe('none')
    expect(valueFor('.cook-entry > .button', 'flex', 0) ?? valueFor('.cook-entry .button', 'flex', 0)).toBe('1 1 auto')
    expect(valueFor('.cook-entry > .button', 'min-inline-size', 0) ?? valueFor('.cook-entry .button', 'min-inline-size', 0)).toBe('0')
  })
  it('the short label "Cook" shows only at 375 px and below (narrow, 23.5 em); the long one hides then', () => {
    expect(valueFor('.cook-entry__short', 'display', 376)).toBe('none')
    expect(valueFor('.cook-entry__long', 'display', 376) ?? 'inline').not.toBe('none')
    expect(valueFor('.cook-entry__short', 'display', 375)).not.toBe('none')
    expect(valueFor('.cook-entry__long', 'display', 375)).toBe('none')
    expect(css).toMatch(/\(width < 23\.5em\)/)
    expect(css).not.toMatch(/22\.5em/)
  })
  it('on a short viewport (under 500 px tall) the hint is visually hidden, and stays in the DOM as the stepper\'s description', () => {
    const short = blocks('(max-height: 499px)')
    const hint = /\.cook-entry__hint\s*\{([^}]*)\}/.exec(short)?.[1] ?? ''
    expect(hint, 'a .cook-entry__hint rule in the (max-height: 499px) block').not.toBe('')
    expect(hint).toMatch(/position:\s*absolute/)
    expect(hint).toMatch(/clip-path:\s*inset\(50%\)|clip:\s*rect\(0/)
    expect(hint).toMatch(/inline-size:\s*1px|width:\s*1px/)
    expect(hint).not.toMatch(/display:\s*none|visibility:\s*hidden/) // those would drop it from the accessibility tree
  })
  it('the hint is shown (not hidden) on a tall phone', () => {
    expect(valueFor('.cook-entry__hint', 'position', 0)).not.toBe('absolute')
  })
})

describe('RX-05: the lede', () => {
  it('is at most 70ch wide and not a tile', () => {
    expect(valueFor('.recipe-about', 'max-inline-size', 0)).toBe('70ch')
  })
  it('clamps the description to 3 lines in one column and 2 lines from 45 rem, and lets Show more open it', () => {
    const t = '.recipe-about__text'
    expect(valueFor(t, '-webkit-line-clamp', FROM - 1)).toBe('3')
    expect(valueFor(t, '-webkit-line-clamp', FROM)).toBe('2')
    expect(valueFor(t, 'overflow', 0)).toBe('hidden')
    const open = rulesFor(".recipe-about__text[data-expanded='true']").map((r) => r.body).join(' ')
    expect(open).toMatch(/-webkit-line-clamp:\s*unset|display:\s*block/)
    expect(open).toMatch(/overflow:\s*visible/)
  })
  it('puts Show more and the Source line in one wrapping row', () => {
    expect(valueFor('.recipe-about__row', 'display', 0)).toBe('flex')
    expect(valueFor('.recipe-about__row', 'flex-wrap', 0)).toBe('wrap')
  })
  it('the Source line is meta text, muted, with its icon beside it', () => {
    const r = rulesFor('.recipe-source').map((x) => x.body).join(' ')
    expect(r).toMatch(/font-size:\s*var\(--text-meta-size\)/)
    expect(r).toMatch(/color:\s*var\(--color-muted\)/)
    expect(r).toMatch(/display:\s*flex/)
  })
})

describe('RX-13: metric tiles', () => {
  const value = '.recipe-detail .tile-metric__value'
  it('a metric value never wraps ("37 min")', () => {
    expect(valueFor(value, 'white-space', 0)).toBe('nowrap')
  })
  it('on a phone (a page narrower than 45 rem) it uses the title-2 role', () => {
    expect(valueFor(value, 'font-size', FROM - 1)).toBe('var(--text-title-2-size)')
    expect(valueFor(value, 'line-height', FROM - 1)).toBe('var(--text-title-2-line)')
    expect(valueFor(value, 'font-size', FROM)).not.toBe('var(--text-title-2-size)')
  })
  it('the old accent-soft overrides are gone', () => {
    expect(css).not.toMatch(/\.recipe-metric\s*\{/)
  })
})

describe('RX-14 and R-E: the Ingredient line is a row with its actions last', () => {
  const row = '.ingredient-lines__row'
  it('has three tracks: name, quantity (auto), the 44 px actions track', () => {
    expect(valueFor(row, 'grid-template-columns', 0)).toMatch(/^minmax\(0, 1fr\) auto (44px|var\(--[\w-]+\))$/)
    expect(valueFor(row, 'grid-template-columns', 375)).toBe(valueFor(row, 'grid-template-columns', 1440)) // one rule, no container variant
  })
  it('the actions are the last track and span both lines, centred; the detail spans the first two tracks', () => {
    expect(valueFor('.ingredient-lines__actions', 'grid-column', 0)).toBe('3')
    expect(valueFor('.ingredient-lines__actions', 'grid-row', 0)).toBe('1 / span 2')
    expect(valueFor('.ingredient-lines__detail', 'grid-column', 0)).toBe('1 / 3')
  })
  it('the name is the key (body-strong); the quantity is the state: body-strong, tabular, never wrapping', () => {
    const name = rulesFor('.ingredient-lines__name').map((r) => r.body).join(' ')
    expect(name).toMatch(/font-weight:\s*var\(--text-body-strong-weight\)/)
    const q = rulesFor('.ingredient-lines__quantity').map((r) => r.body).join(' ')
    expect(q).toMatch(/font-weight:\s*var\(--text-body-strong-weight\)/)
    expect(q).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(q).toMatch(/white-space:\s*nowrap/)
  })
  it('the detail is muted meta, tabular', () => {
    const d = rulesFor('.ingredient-lines__detail').map((r) => r.body).join(' ')
    expect(d).toMatch(/font-size:\s*var\(--text-meta-size\)/)
    expect(d).toMatch(/color:\s*var\(--color-muted\)/)
  })
  it('rows are separated by 1 px --color-line, with --space-2 of padding', () => {
    expect(valueFor(row, 'padding-block', 0)).toBe('var(--space-2)')
    expect(valueFor(row, 'border-block-start', 0) ?? valueFor(row, 'border-top', 0)).toBe('1px solid var(--color-line)')
    expect(valueFor(`${row}:first-child`, 'border-block-start', 0) ?? valueFor(`${row}:first-child`, 'border-top', 0)).toMatch(/^(0|none)$/)
  })
})

describe('R-E: a Step is a row; the Step text is weight 500', () => {
  it('the Step text is the Step weight (500) and never body-strong, 600 or bold; only short keys are body-strong', () => {
    const t = rulesFor('.steps-list__text').map((r) => r.body).join(' ')
    expect(t).toMatch(/font-weight:\s*var\(--text-step-weight\)/)
    expect(t).not.toMatch(/font-weight:\s*(var\(--text-body-strong-weight\)|600|700|bold)/)
    const stepRules = css.split('}').filter((r) => /\.steps-list/.test(r.split('{')[0] ?? '')).join('}')
    expect(stepRules).not.toMatch(/font-weight:\s*(600|700|bold)/)
  })
  it('the row has the number, the body and the time at its end', () => {
    expect(valueFor('.steps-list__item', 'display', 0)).toBe('grid')
    expect(valueFor('.steps-list__item', 'grid-template-columns', 0)).toMatch(/minmax\(0, 1fr\) auto$/)
  })
  it('the time is body-strong, tabular and never wraps; an untimed Step\'s "No time" is muted', () => {
    const t = rulesFor('.steps-list__time').map((r) => r.body).join(' ')
    expect(t).toMatch(/font-weight:\s*var\(--text-body-strong-weight\)/)
    expect(t).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(t).toMatch(/white-space:\s*nowrap/)
    expect(rulesFor(".steps-list__time[data-untimed='true']").map((r) => r.body).join(' ')).toMatch(/color:\s*var\(--color-muted\)/)
  })
  it('the muted detail is meta text with its kind icon', () => {
    const d = rulesFor('.steps-list__detail').map((r) => r.body).join(' ')
    expect(d).toMatch(/font-size:\s*var\(--text-meta-size\)/)
    expect(d).toMatch(/color:\s*var\(--color-muted\)/)
    expect(d).toMatch(/display:\s*flex/)
  })
  it('separates Steps with 1 px --color-line and --space-3 of padding', () => {
    expect(valueFor('.steps-list__item', 'padding-block', 0)).toBe('var(--space-3)')
    expect(valueFor('.steps-list__item', 'border-block-start', 0) ?? valueFor('.steps-list__item', 'border-top', 0)).toBe('1px solid var(--color-line)')
  })
})

describe('A11Y-02 trap: the line ⋮ and the drag handle take the outer ring, not an inner one', () => {
  it('the detail stylesheet sets no negative outline offset on a line, a Step or a chip', () => {
    for (const r of rulesFor('.ingredient-lines__actions').concat(rulesFor('.steps-list__item'), rulesFor('.recipe-tags'))) {
      expect(r.body).not.toMatch(/outline-offset:\s*-/)
    }
    expect(css).not.toMatch(/\.ingredient-lines[^{]*focus-visible[^{]*\{[^}]*outline-offset:\s*-/)
  })
})
