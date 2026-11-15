// B9-39 (TB-15b, TB-01, TB-10): the hero's CSS contract. jsdom does not lay out, so it is read from the stylesheet. The hero's styles go in
// components/TonightHero.css (plan.css belongs to B9-38 in this wave); the rules the user's bug report is about (the ⋮ shares row 1 with the eyebrow and
// the name starts below it) are accepted in either file, and the page-layout scenario `today-after-lunch` measures them for real.
import { describe, expect, it } from 'vitest'
import { ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss, readSource } from './test-css'

const heroCss = readFeatureCss('components/TonightHero.css')
const planCss = readFeatureCss('plan.css')
const both = `${heroCss}\n${planCss}`

/** The declarations (prop -> value) of every rule of `css` whose selector list has a selector that passes `match`. */
function decl(css: string, match: (selector: string) => boolean): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of ruleBlocks(css)) {
    if (!b.selectors.some(match)) continue
    for (const d of b.body.split(';')) {
      const i = d.indexOf(':')
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).replace(/\s+/g, ' ').trim()
    }
  }
  return out
}
const exact = (s: string) => (sel: string) => sel === s

describe('TB-15b: the eyebrow wraps only between its parts', () => {
  const part = decl(heroCss, exact('.plan-hero__eyebrow-part'))
  const row = decl(heroCss, (s) => /\.plan-hero\b/.test(s) && /\.tile__overline$/.test(s) && !/:has\(/.test(s))

  it('each part is nowrap, so "start 08:00" never breaks inside', () => {
    expect(part['white-space']).toBe('nowrap')
  })

  it('the overline of the hero is a wrapping flex row with a 0.4em column gap', () => {
    expect(row['display']).toBe('flex')
    expect(row['flex-wrap']).toBe('wrap')
    expect(row['column-gap']).toBe('0.4em')
  })

  it('"start now" is underlined, 2 px, offset 3 px', () => {
    const now = decl(heroCss, exact(".plan-hero__start[data-now='true']"))
    expect(now['text-decoration']).toMatch(/underline/)
    expect(now['text-decoration-thickness']).toBe('2px')
    expect(now['text-underline-offset']).toBe('3px')
  })
})

describe('the user\'s bug: the ⋮ never overlaps the title (row 1 is the eyebrow and the ⋮, the name starts below)', () => {
  it('with a menu the hero is two columns, the eyebrow in column 1 of row 1, every other child across both columns', () => {
    expect(decl(both, exact('.plan-hero:has(> .plan-hero__menu)'))['grid-template-columns']).toBe('minmax(0, 1fr) auto')
    expect(decl(both, exact('.plan-hero:has(> .plan-hero__menu) > *'))['grid-column']).toBe('1 / -1')
    expect(decl(both, exact('.plan-hero:has(> .plan-hero__menu) > .tile__overline'))).toMatchObject({ 'grid-column': '1', 'grid-row': '1' })
  })

  it('the menu is in the flow at the end of row 1 (never absolutely positioned over the content)', () => {
    expect(decl(both, exact('.plan-hero:has(> .plan-hero__menu) > .plan-hero__menu'))).toMatchObject({ 'grid-column': '2', 'grid-row': '1' })
    expect(decl(both, exact('.plan-hero__menu'))['position'] ?? 'static').not.toMatch(/absolute|fixed/)
  })
})

describe('TB-10: the name, the Course names and the chips are buttons that look like the text around them', () => {
  const name = decl(heroCss, (s) => s === '.plan-hero__name-button')

  it('the name button resets the browser look: inherits the font and colour, shows a pointer', () => {
    // `all: unset` (the mock) or the three longhands: either resets it
    const reset = name['all'] === 'unset' || (name['font'] === 'inherit' && name['color'] === 'inherit' && name['background'] !== undefined)
    expect(reset, JSON.stringify(name)).toBe(true)
    expect(name['cursor']).toBe('pointer')
  })

  it('the name underlines on hover', () => {
    expect(decl(heroCss, (s) => /^\.plan-hero__name-button:hover/.test(s))['text-decoration']).toMatch(/underline/)
  })

  it('a why chip button has no border of its own, is positioned, and its hit area reaches 44 px: an ::after overlay inset -9px block', () => {
    expect(decl(heroCss, (s) => /^\.plan-hero__chips \.chip(\[[^\]]*\])?$/.test(s))['position']).toBe('relative')
    const after = decl(heroCss, (s) => /^\.plan-hero__chips \.chip::after$/.test(s))
    expect(after['content']).toMatch(/^(''|"")$/)
    expect(after['position']).toBe('absolute')
    expect(after['inset']).toMatch(/^-9px\b/)
  })

  it('the hint is meta-sized text of weight 600 (never bold running text)', () => {
    const hint = decl(heroCss, exact('.plan-hero__hint'))
    expect(hint['font-size']).toBe('var(--text-meta-size)')
    expect(hint['font-weight']).toBe('600')
  })

  it('the hero\'s own stylesheet has no raw colour, and no dead why-chip rule left over from before TB-05 (the Tile rule is the one)', () => {
    expect(heroCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    expect(heroCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\.plan-hero \.chip\[data-kind='why'\]/)
  })
})

describe('leftovers of earlier rounds (B9-STATE: B9-01 and B9-08 notes)', () => {
  it('TonightHero passes no `onAccent` to CourseRow (the prop does nothing since DS-12: "Choose a Recipe" is a surface button everywhere)', () => {
    const source = readSource('features/plan/components/TonightHero.tsx')
    expect(source).not.toBe('')
    expect(source).not.toMatch(/\bonAccent\b/)
  })
})
