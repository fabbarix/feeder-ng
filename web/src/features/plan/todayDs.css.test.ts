// DS-TODAY (docs/design/system.md §2, §5, §6, §9): the Today hero and the To confirm tile, as stylesheet text (jsdom does not lay out).
// plan.css still serves the Plan, which is redone in its own wave: only the Today rules are pinned here, but the rules named
// below (.to-confirm*, .plan-hero*, .plan-course__actions) are new or changed and must follow the system.
import { describe, expect, it } from 'vitest'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('plan.css').replace(/\/\*[\s\S]*?\*\//g, '')
const blocks = ruleBlocks(css)
const rulesFor = (pred: (s: string) => boolean) => blocks.filter((b) => b.selectors.some(pred))
const bodyOf = (selector: string) => rulesFor((s) => s === selector).map((b) => b.body).join(';')

describe('plan.css: To confirm (one row per Meal Slot)', () => {
  it('the title row has an info-tone badge', () => {
    const d = declarations(css, ".to-confirm__badge[data-tone='info']")
    expect(d['background']).toBe('var(--color-info-bg)')
    expect(d['color']).toBe('var(--color-info-fg)')
  })

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

  it('on the accent hero a why chip is on-accent at 18 % (neutral, no accent-soft fill)', () => {
    const d = declarations(css, ".plan-hero .chip[data-kind='why']")
    expect(d['background']).toBe('color-mix(in srgb, var(--color-on-accent) 18%, transparent)')
    expect(d['color']).toBe('var(--color-on-accent)')
  })

  it('the eyebrow is not a paragraph of its own any more (.plan-hero__start is gone)', () => {
    expect(css).not.toContain('.plan-hero__start')
  })

  it.each([
    ['prefers-color-scheme dark', ":root:not([data-theme='light']) .plan-hero"],
    ['an explicit dark theme', ":root[data-theme='dark'] .plan-hero"],
  ])('in dark mode (%s) the hero is the darker accent container, with --color-text', (_n, selector) => {
    const d = declarations(css.replace(/@media[^{]*\{/g, ''), selector) // media wrappers are unwrapped by ruleBlocks-style text
    expect(d['background']).toBe('var(--color-soft-strong)')
    expect(d['color']).toBe('var(--color-text)')
  })

  it('in dark mode its Cook button is accent solid (the container is pastel-dark, so the button must stand out)', () => {
    const hit = blocks.find((b) => b.selectors.some((s) => s.includes('.plan-hero') && s.includes("[data-variant='primary']") && s.includes('data-theme')))
    expect(hit, 'no dark rule for the hero\'s primary button').toBeDefined()
    expect(hit!.body).toMatch(/background:\s*var\(--color-accent\)/)
    expect(hit!.body).toMatch(/color:\s*var\(--color-on-accent\)/)
  })
})

describe('plan.css: a Course row of the hero', () => {
  it('the body is one line: name, chip, then the icon group pushed to the end', () => {
    const body = declarations(css, '.plan-course__body')
    expect(body['flex-wrap'] ?? 'nowrap').not.toBe('wrap')
    const actions = declarations(css, '.plan-course__actions')
    expect(actions['display']).toBe('inline-flex')
    expect(actions['margin-inline-start']).toBe('auto')
    expect(actions['flex']).toBe('none')
  })

  it('the recipe name takes the room and ends in an ellipsis rather than pushing the actions to another line', () => {
    const d = declarations(css, '.plan-course .plan-meal__recipe')
    expect(d['min-inline-size']).toBe('0')
    expect(d['text-overflow']).toBe('ellipsis')
  })

  it('the caption (Side) is meta, muted with the colour token, not opacity', () => {
    const d = declarations(css, '.plan-course__caption')
    expect(d['font-size']).toBe('var(--text-meta-size)')
    expect(d['opacity']).toBeUndefined()
  })
})
