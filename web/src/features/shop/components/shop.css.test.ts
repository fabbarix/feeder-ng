// CSS contract of the Shop feature (WP7, rewritten for DS-SHOP: docs/design/system.md, ADR 0016). vitest blanks CSS imports,
// so the stylesheet is read from disk. Tokens only: no raw sizes, no hex, no opacity muting, no mid-word breaks.
import { describe, expect, it } from 'vitest'
import { declarations, readStylesCss, ruleBlocks } from '../../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

function read(): string {
  try {
    return readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  } catch {
    return ''
  }
}
const css = read()
const px = (v: string | undefined) => (v && /^\d+(\.\d+)?px$/.test(v) ? Number(v.replace('px', '')) : 0)
/** the body of the first @media block whose query matches, '' when none */
function media(query: RegExp): string {
  for (const m of css.matchAll(/@media\s*([^{]+)\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)) if (query.test(m[1]!)) return m[2]!.replace(/"/g, "'").replace(/\s+/g, ' ')
  return ''
}
const values = (prop: string) => [...css.matchAll(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'g'))].map((m) => m[1]!.trim())
const withoutQueries = css.replace(/@media\s*[^{]+\{/g, '{')
const outsideMedia = css.replace(/@media\s*[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')

describe('shop.css: tokens only', () => {
  it('exists, has no hex or rgb colour and no !important', () => {
    expect(css).not.toBe('')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    expect(css).not.toContain('!important')
  })

  it('no raw size: every length is a token, 0, a 1 px / 2 px border or the 44 px touch target', () => {
    const raw = [...withoutQueries.matchAll(/(?<![\w.-])(\d*\.?\d+)(px|rem|em|vh|vw|dvh|svh|ch)\b/g)].map((m) => m[0]).filter((v) => !['1px', '2px', '44px'].includes(v))
    expect(raw).toEqual([])
  })

  it('44 px appears only on the tick control and the Not needed toggle (touch targets)', () => {
    for (const b of ruleBlocks(css)) {
      if (/\b44px\b/.test(b.body)) expect(b.selectors, b.body).toEqual(expect.arrayContaining([expect.stringMatching(/^\.(line-row__tick|shop-not-needed__toggle)$/)]))
    }
  })

  it('every font-size is a --text-*-size token and every gap a token', () => {
    for (const v of values('font-size')) expect(v).toMatch(/^var\(--text-[a-z0-9-]+-size\)$/)
    for (const v of [...values('gap'), ...values('row-gap'), ...values('column-gap')]) expect(v).toMatch(/^(var\(--[a-z0-9-]+\)\s*)+$/)
  })

  it('muted text uses --color-muted, never opacity', () => {
    expect(css).not.toMatch(/(^|[;{\s])opacity\s*:/)
    expect(css).not.toMatch(/filter\s*:\s*opacity/)
  })

  it('no mid-word breaking: no overflow-wrap, word-break, hyphens (ListRow owns the title wrap)', () => {
    expect(css).not.toMatch(/overflow-wrap|word-break|hyphens|line-break\s*:/)
  })

  it('the accent is only for the one primary action: Button and Tile own it, this stylesheet never paints with it', () => {
    expect(css).not.toMatch(/var\(--color-(accent|primary|soft|soft-strong|accent-text|on-accent)\b/)
  })

  it('sets no max-width of its own: the Page owns the width', () => {
    expect(css).not.toMatch(/max-(inline-size|width)/)
  })

  it('has no rule left for the old tiles', () => {
    expect(css).not.toMatch(/line-tile|cost-tile|\.shop-lines \.bento-grid|line-tile__check/)
  })
})

describe('shop.css: the page', () => {
  it('sections are spaced by --section-gap', () => {
    expect(declarations(css, '.shop-screen')['gap']).toBe('var(--section-gap)')
  })

  it('the page ends above the nav: no bottom padding, margin or height of its own (Page owns --nav-clearance)', () => {
    expect(css).not.toMatch(/(padding|margin)-(bottom|block-end)|(min-)?(height|block-size)\s*:\s*100[a-z]*/)
    expect(css).not.toMatch(/position\s*:\s*(fixed|sticky)/)
  })

  it('the sheet form stacks its fields with a token gap (TickSheet, ExtraSheet)', () => {
    const d = declarations(css, '.shop-sheet-form')
    expect(d['display']).toMatch(/^(flex|grid)$/)
    if (d['display'] === 'flex') expect(d['flex-direction']).toBe('column')
    expect(d['gap']).toMatch(/^var\(--space-\d+\)$/)
  })
})

describe('shop.css: one list on a phone, a 2-column card grid from 768 px', () => {
  it('below 768 px the list is the plain ListGroup column (no grid rule outside the media query)', () => {
    expect(outsideMedia.replace(/\s+/g, ' ')).not.toMatch(/\.shop-lines[^{]*\{[^}]*grid-template-columns/)
  })

  it('from 768 px the list is auto-fill tracks of --tile-min-card (2 columns at 768, 834, 1024), spaced by --bento-gap', () => {
    const m = media(/min-width:\s*768px/)
    expect(m).toMatch(/\.shop-lines \.list-group__list\s*\{[^}]*display:\s*grid/)
    expect(m).toMatch(/grid-template-columns:\s*repeat\(auto-fill, minmax\(min\(var\(--tile-min-card\), 100%\), 1fr\)\)/)
    expect(m).toMatch(/gap:\s*var\(--bento-gap\)/)
  })

  it('in the card grid each row is its own card (surface fill, tile radius) and its content stays CENTRED in the row (system.md §3)', () => {
    const m = media(/min-width:\s*768px/)
    const block = m.match(/\.shop-lines \.list-row\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(block).toMatch(/border-radius:\s*var\(--radius-tile-sm\)/)
    expect(block).toMatch(/background:\s*var\(--color-surface\)/)
    expect(block).not.toMatch(/align-items\s*:\s*(start|flex-start|baseline)/)
    expect(block).not.toMatch(/align-content\s*:\s*(start|flex-start)/)
  })

  it('only the grid TRACKS start at the top: the list aligns its items to start, so a short row is not stretched to a tall neighbour', () => {
    const m = media(/min-width:\s*768px/)
    expect(m).toMatch(/\.shop-lines \.list-group__list\s*\{[^}]*align-items:\s*start/)
  })
})

describe('shop.css: the row', () => {
  it('the tick control is a 44 x 44 px hit area with no border of its own (the ring is drawn inside it)', () => {
    const d = declarations(css, '.line-row__tick')
    const width = Math.max(px(d['min-width']), px(d['width']), px(d['min-inline-size']), px(d['inline-size']))
    const height = Math.max(px(d['min-height']), px(d['height']), px(d['min-block-size']), px(d['block-size']))
    expect(width).toBeGreaterThanOrEqual(44)
    expect(height).toBeGreaterThanOrEqual(44)
    expect(d['border'] ?? '0').toMatch(/^(0|none)\b/)
    expect(d['background']).toMatch(/^(transparent|none)$/)
  })

  it('round 2: the visible ring is 24 px (--space-6), centred in the 44 px target, a pill with a 2 px outline', () => {
    const d = declarations(css, '.line-row__tick::before')
    expect(d['inline-size']).toBe('var(--space-6)')
    expect(d['block-size']).toBe('var(--space-6)')
    expect(d['border-radius']).toBe('var(--radius-pill)')
    expect(d['border']).toMatch(/^2px solid /)
    expect(d['content']).toBeDefined()
    expect(declarations(css, '.line-row__tick')['display']).toMatch(/grid|flex/)
  })

  it('round 2: the ring stays visible in dark mode: its colour is a theme token with a dark value (--color-muted), never transparent or --status-*-bg', () => {
    const d = declarations(css, '.line-row__tick::before')
    expect(d['border']).toMatch(/var\(--color-muted\)/)
    const styles = readStylesCss().replace(/\/\*[\s\S]*?\*\//g, '')
    expect((styles.match(/--color-muted:/g) ?? []).length).toBeGreaterThanOrEqual(2) // light and dark
  })

  it('round 2: ticked = a plain check in a filled success circle: the ring fills with success, the check uses the on-success token', () => {
    const ring = declarations(css, ".line-row__tick[aria-pressed='true']::before")
    expect(ring['background']).toBe('var(--status-success-solid)')
    expect(ring['border-color']).toBe('var(--status-success-solid)')
    const tick = declarations(css, ".line-row__tick[aria-pressed='true']")
    expect(tick['color']).toBe('var(--status-success-on-solid)')
    expect(css).not.toMatch(/color\s*:\s*var\(--status-success-bg\)/)
  })

  it('round 2: styles.css defines --status-success-on-solid wherever --status-danger-on-solid is (light, dark, forced dark), so the check has contrast', () => {
    const styles = readStylesCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const count = (name: string) => (styles.match(new RegExp(`${name}:`, 'g')) ?? []).length
    expect(count('--status-success-on-solid')).toBeGreaterThanOrEqual(2)
    expect(count('--status-success-on-solid')).toBe(count('--status-danger-on-solid'))
  })

  it('a ticked title is struck through and muted', () => {
    const d = declarations(css, ".shop-lines .list-row[data-state='ticked'] .list-row__title")
    expect(d['text-decoration']).toContain('line-through')
    expect(d['color']).toBe('var(--color-muted)')
  })

  it('a Not needed row is muted the same way, without a strike', () => {
    const d = declarations(css, ".shop-lines .list-row[data-state='not-needed'] .list-row__title")
    expect(d['color']).toBe('var(--color-muted)')
    expect(d['text-decoration'] ?? 'none').not.toContain('line-through')
  })
})

describe('shop.css: metric strip and notice', () => {
  it('the progress fill is success', () => {
    expect(declarations(css, '.shop-metrics__fill')['background']).toBe('var(--status-success-solid)')
  })

  it('metric values use the type roles: title-2, and display for the "left" number from 600 px up', () => {
    expect(declarations(css, '.shop-metrics__value')['font-size']).toBe('var(--text-title-2-size)')
    expect(declarations(css, '.shop-metrics__value')['font-variant-numeric']).toBe('tabular-nums')
    expect(media(/min-width:\s*600px/)).toMatch(/\.shop-metrics__value\[data-metric='left'\]\s*\{[^}]*font-size:\s*var\(--text-display-size\)/)
  })

  it('metric labels and captions are muted meta text', () => {
    const d = declarations(css, '.shop-metrics__label')
    expect(d['color']).toBe('var(--color-muted)')
    expect(d['font-size']).toBe('var(--text-meta-size)')
  })

  it('the notice lays its sentence and its action out with token gaps; its colour comes from the info status Tile', () => {
    const d = declarations(css, '.shop-notice')
    expect(d['gap']).toMatch(/^var\(--space-\d+\)$/)
    expect(css).not.toMatch(/\.shop-notice[^{]*\{[^}]*(background|color)\s*:/)
  })

  it('the Not needed group toggle is a 44 px target in the muted label style', () => {
    const d = declarations(css, '.shop-not-needed__toggle')
    expect(px(d['min-height'])).toBeGreaterThanOrEqual(44)
    expect(d['color']).toBe('var(--color-muted)')
    expect(d['font-size']).toBe('var(--text-label-size)')
  })
})

describe('shop.css: round 2', () => {
  it('a ticked row mutes its quantity and cost as well as its name', () => {
    expect(declarations(css, ".shop-lines .list-row[data-state='ticked'] .list-row__value")['color']).toBe('var(--color-muted)')
  })

  it('the metric tile does not collapse its content to the start: the progress bar spans the full width of its tile', () => {
    const tile = declarations(css, '.shop-metrics__tile')
    // round 3: `inline-size: 100%` on the bar passes while an auto grid track sizes to the content (126 px bar in a 387 px tile),
    // so the TRACK is what is pinned: one column that stretches to the tile and may shrink.
    expect(tile['display']).toBe('grid')
    expect(tile['grid-template-columns']).toMatch(/^minmax\(0, ?1fr\)$/)
    expect(tile['justify-items'] ?? 'stretch').toBe('stretch')
    const bar = declarations(css, '.shop-metrics__bar')
    expect(bar['inline-size']).toBe('100%')
    expect(bar['block-size']).toMatch(/^var\(--space-\d+\)$/)
    expect(bar['background']).toMatch(/^var\(--color-(line|surface)\)$/) // a visible empty track, not a grey pill
    expect(declarations(css, '.shop-metrics__fill')['inset-inline-start']).toBe('0')
  })

  it('the "of N left" unit and the meta line are meta text; the unit sits on the value\'s baseline', () => {
    expect(declarations(css, '.shop-metrics__unit')['font-size']).toBe('var(--text-body-strong-size)')
    expect(declarations(css, '.shop-metrics__unit')['color']).toBe('var(--color-muted)')
    expect(declarations(css, '.shop-metrics__meta')['font-size']).toBe('var(--text-meta-size)')
    expect(declarations(css, '.shop-metrics__meta')['color']).toBe('var(--color-muted)')
  })

  it('the Scan tile spreads its caption and its button over the tile, and the button fills the width (no short pill in a big tile)', () => {
    expect(declarations(css, '.shop-metrics__scan-tile')['align-content']).toBe('space-between')
    expect(declarations(css, '.shop-metrics__scan-tile')['grid-template-columns']).toMatch(/^minmax\(0, ?1fr\)$/)
    expect(declarations(css, '.shop-metrics__scan')['inline-size']).toBe('100%')
  })

  it('round 3: the Scan button fills its tile at EVERY width: no media query narrows it, and it is a block-level grid item', () => {
    expect(css.match(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g)?.filter((m) => m.includes('.shop-metrics__scan')) ?? []).toEqual([])
    const d = declarations(css, '.shop-metrics__scan')
    expect(d['inline-size']).toBe('100%')
    expect(d['justify-self'] ?? 'stretch').toBe('stretch')
    expect(d['max-inline-size']).toBeUndefined()
  })

  it('section titles have a count pill: a neutral container with a chip-sized number', () => {
    const t = declarations(css, '.shop-section__title')
    expect(t['display']).toMatch(/flex|inline-flex/)
    const pill = declarations(css, '.shop-section__count')
    expect(pill['background']).toBe('var(--color-surface-2)')
    expect(pill['border-radius']).toBe('var(--radius-pill)')
    expect(pill['font-size']).toBe('var(--text-chip-size)')
    expect(pill['font-variant-numeric']).toBe('tabular-nums')
  })

  it('the notice sentence is clamped to two lines with an ellipsis (the full text is in its title)', () => {
    const d = declarations(css, '.shop-notice__text')
    expect(d['display']).toBe('-webkit-box')
    expect(d['-webkit-line-clamp']).toBe('2')
    expect(d['overflow']).toBe('hidden')
  })

  it('the header pickers are ONE row of compact chips at every width: a flex row that does not wrap, token gap, aligned to the content grid', () => {
    const d = declarations(css, '.shop-screen__controls')
    expect(d['display']).toBe('flex')
    expect(d['flex-wrap'] ?? 'nowrap').toBe('nowrap')
    expect(d['gap']).toMatch(/^var\(--space-\d+\)$/)
    expect(d['grid-template-columns']).toBeUndefined()
    expect(d['justify-content'] ?? 'flex-start').toMatch(/^(flex-start|start)$/)
    expect(d['margin-inline'] ?? '0').toBe('0')
    // no media query turns it back into two equal columns
    expect(css).not.toMatch(/\.shop-screen__controls[^{]*\{[^}]*grid-template-columns/)
  })

  it('the pickers shrink with an ellipsis before they wrap (min-inline-size 0), the locate button keeps its size', () => {
    expect(declarations(css, '.shop-screen__controls > *')['min-inline-size']).toBe('0')
    expect(declarations(css, '.shop-screen__shop')['display']).toBe('flex')
    expect(declarations(css, '.shop-screen__shop')['align-items'] ?? 'center').toBe('center')
  })
})
