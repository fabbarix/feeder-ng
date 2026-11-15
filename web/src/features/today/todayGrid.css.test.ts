// B9-44 (TB-03, TB 1, ADR 0026, RES-05, TB-11; mock tb-today `<style data-proposed>`): Today lays its own grid out by the CONTAINER's width
// (a size container named `today`), never by the viewport. jsdom does not lay out: stylesheet text.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'
import { readFeatureCss } from './test-css'

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const css = strip(readFeatureCss('today.css'))
const planCss = strip(readSource('features/plan/plan.css'))
const heroCss = strip(readSource('features/plan/components/TonightHero.css'))
const listRowCss = strip(readSource('ui/ListRow.css'))

/** The inside of every at-rule block whose prelude matches `prelude` (brace matched). */
function atBlocks(text: string, prelude: RegExp): string[] {
  const out: string[] = []
  const re = /@(?:container|media)\s*([^{]*)\{/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!prelude.test(m[1] ?? '')) continue
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    while (i < text.length && depth > 0) {
      depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0
      i++
    }
    out.push(text.slice(start, i - 1))
  }
  return out
}
/** The declarations of the first rule for `selector` inside `block` (or the top level of `text`), as a map. */
function rule(text: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' '))
    if (!sels.includes(selector)) continue
    for (const d of m[2]!.split(';')) {
      const i = d.indexOf(':')
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim().replace(/\s+/g, ' ')
    }
  }
  return out
}
const topLevel = (text: string) => {
  // drop at-rule blocks so that a base rule is not mistaken for a container-query rule
  let out = text
  for (const m of [...text.matchAll(/@(?:container|media|supports)[^{]*\{/g)].reverse()) {
    let depth = 1
    let i = m.index! + m[0].length
    while (i < out.length && depth > 0) {
      depth += out[i] === '{' ? 1 : out[i] === '}' ? -1 : 0
      i++
    }
    out = out.slice(0, m.index!) + out.slice(i)
  }
  return out
}

describe('today.css: Today is a size container named `today` (TB-03)', () => {
  const d = rule(topLevel(css), '.today')
  it('.today has container-type inline-size and the name today', () => {
    const shorthand = d['container'] ?? ''
    const named = /^today\s*\/\s*inline-size$/.test(shorthand) || (d['container-name'] === 'today' && d['container-type'] === 'inline-size')
    expect(named).toBe(true)
  })

  it('the grid has no media query on the viewport for its columns: the container queries are the only seams', () => {
    for (const block of atBlocks(css, /min-width|width\s*[<>]/).filter((b) => /\.today__grid|\.today__aside/.test(b))) {
      expect(block).not.toMatch(/grid-template-columns|grid-template-areas/)
    }
    expect(atBlocks(css, /^today\b/).length).toBeGreaterThanOrEqual(2)
  })
})

describe('today.css: columns come from the container (TB-03 table)', () => {
  const base = rule(topLevel(css), '.today__grid')
  it('one column below 40 rem, and each tile as tall as its own content (SHELL-15)', () => {
    expect(base['display']).toBe('grid')
    expect(base['grid-template-columns']).toMatch(/^(minmax\(0,\s*1fr\)|1fr|repeat\(1,.*\))$/)
    expect(base['align-items']).toBe('start')
  })

  it('two columns from 40 rem: the hero, To confirm and the metric strip span both; the other tiles are half tiles', () => {
    const [block] = atBlocks(css, /^today\s*\(\s*(min-width:\s*40rem|width\s*>=\s*40rem|inline-size\s*>=\s*40rem)\s*\)/)
    expect(block, 'a @container today (min-width: 40rem) block').toBeDefined()
    const grid = rule(block!, '.today__grid')
    expect(grid['grid-template-columns']).toMatch(/repeat\(\s*2\s*,/)
    expect(grid['align-items'] ?? base['align-items']).toBe('start')
    expect(block).toMatch(/\[data-tile='nextMeal'\]/)
    expect(block).toMatch(/\[data-tile='toConfirm'\]/)
    expect(block).toMatch(/grid-column:\s*1\s*\/\s*-1/)
  })

  it('three tracks from 60 rem, with areas `hero hero aside` / `confirm confirm aside`', () => {
    const [block] = atBlocks(css, /^today\s*\(\s*(min-width:\s*60rem|width\s*>=\s*60rem|inline-size\s*>=\s*60rem)\s*\)/)
    expect(block, 'a @container today (min-width: 60rem) block').toBeDefined()
    const grid = rule(block!, '.today__grid')
    expect(grid['grid-template-columns']).toMatch(/repeat\(\s*3\s*,/)
    const areas = grid['grid-template-areas'] ?? ''
    expect(areas).toMatch(/hero\s+hero\s+aside/)
    expect(areas).toMatch(/confirm\s+confirm\s+aside/)
    expect(block).toMatch(/\.today__aside\s*\{[^}]*grid-area:\s*aside/)
  })

  it('the aside stacks Advance Steps and the metric strip (as a column, with the grid gap) from 60 rem; below it dissolves (display: contents)', () => {
    expect(rule(topLevel(css), '.today__aside')['display']).toBe('contents')
    const [block] = atBlocks(css, /^today\s*\(\s*(min-width:\s*60rem|width\s*>=\s*60rem|inline-size\s*>=\s*60rem)\s*\)/)
    const aside = rule(block!, '.today__aside')
    expect(aside['display']).toMatch(/^(grid|flex)$/)
    expect(aside['gap']).toBe('var(--bento-gap)')
    expect(aside['align-self']).toBe('start')
  })

  it('on a phone and a tablet only CSS `order` moves the metric strip to the end; the DOM keeps it after Advance Steps', () => {
    const o = rule(topLevel(css), ".today__slot[data-tile='metrics']")['order'] ?? rule(topLevel(css), ".today__slot[data-tile='metrics']")['order']
    expect(Number(o)).toBeGreaterThan(5)
    const [wide] = atBlocks(css, /^today\s*\(\s*(min-width:\s*60rem|width\s*>=\s*60rem|inline-size\s*>=\s*60rem)\s*\)/)
    expect(rule(wide!, ".today__slot[data-tile='metrics']")['order']).toBe('0')
  })

  it('the Shopping and setup tiles are full-row tiles at every width', () => {
    const blocks = [topLevel(css), ...atBlocks(css, /^today/)].join('\n')
    expect(blocks).toMatch(/\[data-tile='shopping'\][^{]*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
    expect(blocks).toMatch(/\[data-tile='setup'\][^{]*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  })

  it('an odd last half tile keeps its width and starts at the line start (no justify-self: end, no span 2 on a half tile)', () => {
    expect(css).not.toMatch(/justify-self:\s*(end|center)/)
  })

  it('the slot wrappers are still display: contents', () => {
    expect(rule(topLevel(css), '.today__slot')['display']).toBe('contents')
  })

  it('has no raw column counts outside the container queries (ADR 0026 replaces ADR 0016 for Today only)', () => {
    expect(topLevel(css)).not.toMatch(/repeat\(\s*[23]\s*,/)
  })
})

describe('today.css: the metric strip (TB-03)', () => {
  it('the icon is in the value row (flex, space-between) and no longer absolutely placed over the tile', () => {
    const head = rule(topLevel(css), '.today-metric__head')
    expect(head['display']).toBe('flex')
    expect(head['justify-content']).toBe('space-between')
    expect(rule(topLevel(css), '.today-metric__icon')['position'] ?? 'static').not.toBe('absolute')
    expect(css).not.toMatch(/\.today-metric__icon\s*\{[^}]*inset-/)
  })

  it('the value can shrink and ends in an ellipsis, so the icon never covers it', () => {
    const v = rule(topLevel(css), '.today-metric__value')
    expect(v['min-inline-size']).toBe('0')
    expect(v['text-overflow']).toBe('ellipsis')
    expect(v['overflow']).toBe('hidden')
  })

  it('two tiles side by side in the aside (the strip is a 2 column group there)', () => {
    const [block] = atBlocks(css, /^today\s*\(\s*(min-width:\s*60rem|width\s*>=\s*60rem|inline-size\s*>=\s*60rem)\s*\)/)
    expect(block).toMatch(/\.today-metrics[^{]*\{[^}]*grid-column:\s*auto|\.today-metrics \.bento-grid/)
  })
})

describe('today.css: the skeleton reserves the measured heights (RES-05)', () => {
  it('--skeleton-hero is 193 px, 208 px from 600 px and 220 px from 1024 px', () => {
    expect(rule(topLevel(css), '.today')['--skeleton-hero'] ?? rule(topLevel(css), ':root')['--skeleton-hero']).toBe('193px')
    expect(atBlocks(css, /min-width:\s*600px|width\s*>=\s*600px|min-width:\s*37\.5em/).join('\n')).toMatch(/--skeleton-hero:\s*208px/)
    expect(atBlocks(css, /min-width:\s*1024px|width\s*>=\s*1024px|min-width:\s*64em/).join('\n')).toMatch(/--skeleton-hero:\s*220px/)
  })
  it('the skeleton hero uses the token; a skeleton row is 56 px and the metric tile 90 px', () => {
    expect(rule(topLevel(css), '.today-skeleton__hero')['block-size'] ?? rule(topLevel(css), '.today-skeleton__hero')['min-block-size']).toBe('var(--skeleton-hero)')
    expect(rule(topLevel(css), '.today-skeleton__row')['block-size']).toBe('56px')
    expect(rule(topLevel(css), '.today-skeleton__metric')['block-size']).toBe('90px')
  })
})

describe('the hero’s Cook button follows the hero’s own width, not the viewport (TB-03)', () => {
  const all = `${planCss}\n${heroCss}`
  it('has no @media (min-width: 820px) on .plan-hero__actions', () => {
    for (const block of atBlocks(all, /min-width:\s*820px/)) expect(block).not.toMatch(/plan-hero__actions/)
  })
  it('is full width below 35 rem of hero and an auto-width button at the end from 35 rem (one container rule)', () => {
    const [block] = atBlocks(all, /plan-hero\s*\(\s*(min-width:\s*35rem|width\s*>=\s*35rem)\s*\)/)
    expect(block, '@container plan-hero (min-width: 35rem)').toBeDefined()
    expect(rule(block!, '.plan-hero__actions')['justify-content']).toBe('flex-end')
    expect(atBlocks(all, /plan-hero\s*\(\s*min-width:\s*44rem\s*\)/).join('')).not.toMatch(/plan-hero__actions/)
  })
})

describe('rows inside a tile take the tile’s padding, and a narrow row keeps its one-line meta (TB-11)', () => {
  it('ListRow.css: a row inside a tile has no inline padding of its own', () => {
    expect(listRowCss).toMatch(/\.tile\s+\.list-row\s*\{[^}]*padding-inline:\s*0/)
  })
  it('ListRow.css: under 20 rem of row the value column’s minimum is --row-value-narrow, by container', () => {
    const blocks = atBlocks(listRowCss, /(max-width:\s*20rem|width\s*<\s*20rem)/).join('\n')
    expect(blocks).toMatch(/\.list-row__value[^{]*\{[^}]*min-inline-size:\s*var\(--row-value-narrow\)/)
  })
})
