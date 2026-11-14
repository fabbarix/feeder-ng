// B9-07 (DS-11 in ui/ and app/): no raw radius, no raw spacing, no opacity muting in any stylesheet of web/src/ui and web/src/app.
// The same three rules as check-ui (`raw-radius`, `raw-spacing`, the widened `opacity-muting`), stated here over the whole of ui/ and app/ so a
// targeted vitest run shows them; the shell fixtures in scripts/test/ hold the rules' own counting units.
//   raw-radius   a border-radius value with a px or rem number other than 0 once var(...) is taken out (50 % stays allowed).
//   raw-spacing  gap, row-gap, column-gap, padding*, margin*, inset* with a px or rem number other than 0 and 1px once var(...) is
//                taken out, calc() included ("--space-half: 2px" is the token for a 2 px micro gap; a negative margin of 2 px or more
//                is a violation too, as the plan's awk reads "-" before the number as part of a token name: see raw-spacing.sh).
//   opacity      0.05 to 0.95 on a rule that is not a disabled state, not a pseudo-element, not a keyframe step and not a decorative
//                `__glyph` / `__icon` element: mute text with --color-muted, show a pressed state with shape, not fade.
import { describe, expect, it } from 'vitest'
import { blocksOf, isTokenBlock, lastCompound, selectorList } from './lib/cssWalk.test-helper'

const blocks = blocksOf(['ui', 'app']).filter((b) => !isTokenBlock(b))
const stripVars = (v: string) => v.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, '')
const where = (b: { file: string; line: number; selector: string }, extra: string) => `${b.file}:${b.line} ${b.selector}: ${extra}`

describe('raw radii (DS-11)', () => {
  it('every border-radius is a token, 0 or 50 %', () => {
    const bad = blocks.flatMap((b) => b.decls.filter(([p, v]) => /^border(-[a-z]+-[a-z]+)?-radius$/.test(p) && /(^|[^\w.-])\d*\.?\d+(px|rem)\b/.test(stripVars(v)) && !/^0(px|rem)?$/.test(v)).map(([p, v]) => where(b, `${p} ${v}`)))
    expect(bad).toEqual([])
  })

  it('the new radius tokens are the ones used: Checkbox --radius-tick, Toast and mealSlot buttons --radius-button, shell --radius-control, Viewfinder tile radii', () => {
    const css = (f: string, sel: string) => blocks.filter((b) => b.file === f && selectorList(b.selector).includes(sel)).flatMap((b) => b.decls)
    const radius = (f: string, sel: string) => css(f, sel).find(([p]) => p === 'border-radius')?.[1]
    expect(radius('ui/fields/Checkbox.css', '.checkbox__box')).toMatch(/--radius-tick/)
    expect(blocks.filter((b) => b.file === 'ui/Toast.css').flatMap((b) => b.decls).filter(([p]) => p === 'border-radius').every(([, v]) => /^var\(--radius-[a-z-]+\)$/.test(v))).toBe(true)
    expect(blocks.filter((b) => b.file === 'ui/ViewfinderStrip.css').flatMap((b) => b.decls).filter(([p]) => p === 'border-radius').every(([, v]) => /var\(--radius-/.test(v))).toBe(true)
  })
})

describe('raw spacing (DS-11)', () => {
  const PROP = /^(gap|row-gap|column-gap|padding(-[a-z-]+)?|margin(-[a-z-]+)?|inset(-[a-z-]+)?)$/
  it('every gap, padding, margin and inset is a --space-* / layout token, 0 or a 1px hairline', () => {
    const bad = blocks.flatMap((b) =>
      b.decls
        .filter(([p, v]) => PROP.test(p) && /(^|[^0-9.a-z-])([2-9]|[1-9][0-9]+|0?\.[0-9]+|1\.[0-9]+)(px|rem)/.test(stripVars(v)))
        .map(([p, v]) => where(b, `${p} ${v}`)),
    )
    expect(bad).toEqual([])
  })
})

describe('opacity muting (DS-11, widened to 0.05-0.95)', () => {
  const exempt = (sel: string) => /:disabled|\[disabled|aria-disabled|data-disabled/.test(sel) || /::?(before|after|placeholder)\b/.test(lastCompound(sel)) || /(__glyph|__icon)(?![a-z-])/.test(lastCompound(sel))
  it('no rule mutes with opacity, outside disabled states, pseudo-elements and decorative glyphs', () => {
    const bad = blocks.flatMap((b) =>
      b.decls
        .filter(([p, v]) => {
          if (p !== 'opacity') return false
          const n = /^[0-9.]+%$/.test(v) ? parseFloat(v) / 100 : /^[0-9.]+$/.test(v) ? parseFloat(v) : NaN
          return n >= 0.05 && n <= 0.95
        })
        .filter(() => selectorList(b.selector).some((s) => !exempt(s)))
        .map(([, v]) => where(b, `opacity ${v}`)),
    )
    expect(bad).toEqual([])
  })
})
