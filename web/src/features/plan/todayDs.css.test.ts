// DS-TODAY (docs/design/system.md §2, §5, §6, §9): the Today hero and the To confirm tile, as stylesheet text (jsdom does not lay out).
// plan.css still serves the Plan, which is redone in its own wave: only the Today rules are pinned here, but the rules named
// below (.to-confirm*, .plan-hero*, .plan-course__actions) are new or changed and must follow the system.
import { describe, expect, it } from 'vitest'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss } from './test-css'

// The hero and the To confirm rows own their stylesheet (plan.css stays free of .plan-course and chip painting).
const css = readFeatureCss('components/TonightHero.css').replace(/\/\*[\s\S]*?\*\//g, '')
const blocks = ruleBlocks(css)
const rulesFor = (pred: (s: string) => boolean) => blocks.filter((b) => b.selectors.some(pred))
const bodyOf = (selector: string) => rulesFor((s) => s === selector).map((b) => b.body).join(';')

describe('plan.css: To confirm (one row per Meal Slot)', () => {
  // B9-44 (TB-09, removed on purpose): .to-confirm__badge is gone; TileHeader draws the info badge.

  it('the day + slot badge is a 4.5 rem neutral box (surface-2), the date badge of the system', () => {
    const d = declarations(css, '.to-confirm__when')
    expect(d['inline-size']).toBe('4.5rem')
    expect(d['background']).toBe('var(--color-surface-2)')
    expect(d['color']).toBe('var(--color-text)')
  })

  it('the row is a grid of badge | text | actions, the text column can shrink, content centred in its own row', () => {
    const d = declarations(css, '.to-confirm__row')
    expect(d['display']).toBe('grid')
    expect(d['grid-template-columns']).toContain('minmax(0, 1fr)')
    expect(d['align-items']).toBe('center')
  })

  it('the Main Recipe is body-strong, the "+ Side" line is meta, muted, one line with an ellipsis (never a third line)', () => {
    const title = declarations(css, '.to-confirm__title')
    expect(title['font-size']).toBe('var(--text-body-strong-size)')
    const meta = declarations(css, '.to-confirm__meta')
    expect(meta['font-size']).toBe('var(--text-meta-size)')
    expect(meta['color']).toBe('var(--color-muted)')
    expect(meta['white-space']).toBe('nowrap')
    expect(meta['overflow']).toBe('hidden')
    expect(meta['text-overflow']).toBe('ellipsis')
  })

  it('rows are separated by a 1 px --color-line divider, no ad-hoc margins', () => {
    const d = bodyOf('.to-confirm__row + .to-confirm__row')
    expect(d).toMatch(/border-(block-start|top)\s*:\s*1px solid var\(--color-line\)/)
    expect(d).not.toMatch(/margin/)
  })

  it('the old per-Course heading, "plan-confirm", is gone', () => {
    expect(css).not.toContain('.plan-confirm')
  })
})

describe('plan.css: the Today hero', () => {
  it('the title uses the type roles (title-2 on a phone, title-1 from 520 px) and never breaks a word', () => {
    const body = bodyOf('.plan-hero__name')
    expect(body).toMatch(/font-size:\s*var\(--text-title-2-size\)/)
    expect(css).toMatch(/\.plan-hero__name[^{]*\{[^}]*font-size:\s*var\(--text-title-1-size\)/)
    expect(css).not.toMatch(/\.plan-hero[^{]*\{[^}]*overflow-wrap\s*:\s*(anywhere|break-word)/)
    expect(css).not.toMatch(/\.plan-hero[^{]*\{[^}]*font-size:\s*\d/)
  })

  it('the why chips stay on one line: no wrap, clipped by the row, each chip may shrink', () => {
    const d = declarations(css, '.plan-hero__chips')
    expect(d['flex-wrap'] ?? 'nowrap').toBe('nowrap')
    expect(d['overflow']).toBe('hidden')
    expect(d['min-inline-size'] ?? '0').toBe('0')
  })

  // B9-39 (TB-01): the hero's why chip takes ui/Tile.css's currentColor tint; this file's dead on-accent rule is gone (TonightHero.tb01.css.test).
  it('on the accent hero a why chip has no colour rule of its own here (the tint is ui/Tile.css\'s)', () => {
    expect(css).not.toMatch(/\.plan-hero \.chip\[data-kind='why'\]\s*\{[^}]*(background|color)\s*:/)
  })

  // B9-39 (TB-01): the start-by is a part of the eyebrow, never a paragraph of its own; it is styled only in its "start now" state.
  it('the eyebrow is not a paragraph of its own any more (.plan-hero__start is styled only as [data-now])', () => {
    for (const m of css.matchAll(/\.plan-hero__start[^{,]*/g)) expect(m[0]).toContain("[data-now='true']")
  })

  // TB-05 (B9-08): the dark hero rule lives in ui/Tile.css keyed on data-scheme; the four data-theme blocks are gone from here.
  it('TB-05: TonightHero.css has no dark-mode block of its own (no data-theme, no prefers-color-scheme, no data-scheme)', () => {
    expect(css).not.toMatch(/data-theme/)
    expect(css).not.toMatch(/prefers-color-scheme/)
    expect(css).not.toMatch(/data-scheme/)
  })

  it('TB-05: the hero paints no background or text colour of its own for dark (the Tile rule does)', () => {
    for (const b of blocks.filter((x) => x.selectors.some((s) => /^\.plan-hero(\s|$)/.test(s) && !s.includes('.chip') && !s.includes('__')))) {
      expect(b.body, b.selectors.join(',')).not.toMatch(/background:\s*var\(--color-soft-strong\)/)
    }
  })
})

describe('plan.css: a Course row of the hero', () => {
  it('the body is one line: name, chip, then the icon group pushed to the end', () => {
    const body = declarations(css, '.plan-course__body')
    expect(body['flex-wrap'] ?? 'nowrap').not.toBe('wrap')
    const actions = declarations(css, '.plan-course__actions')
    // round 2 wins: one evenly sized group, so a grid (todayRound2.css.test.ts)
    expect(actions['display']).toMatch(/^(grid|inline-grid)$/)
    expect(actions['margin-inline-start']).toBe('auto')
  })

  // round 2 wins: the hero Course name is never ellipsised; it wraps.
  it('the recipe name can shrink and wraps, never an ellipsis', () => {
    const d = declarations(css, '.plan-course .plan-meal__recipe')
    expect(d['min-inline-size']).toBe('0')
    expect(d['text-overflow']).toBeUndefined()
  })

  it('the caption (Side) is meta, muted with the colour token, not opacity', () => {
    const d = declarations(css, '.plan-course__caption')
    expect(d['font-size']).toBe('var(--text-meta-size)')
    expect(d['opacity']).toBeUndefined()
  })
})
