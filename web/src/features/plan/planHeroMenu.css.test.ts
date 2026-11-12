// CRS F: the hero's overline (the Meal Slot name, up to 50 characters) never sits under the slot menu (⋮).
// Either the menu shares a flex row with the overline (it is not taken out of the flow), or the overline reserves
// the menu's width plus a gap with padding-inline-end. jsdom does not lay out, so this reads the stylesheet.
import { describe, expect, it } from 'vitest'
import { readFeatureCss, readSource } from './test-css'

const css = readFeatureCss('plan.css')
const tokens = readSource('styles.css')

const block = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&')
  const m = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  return m ? m[2]!.replace(/\s+/g, ' ') : ''
}
/** Resolves `Npx`, `var(--space-N)` and `calc(a + b)` made of those to pixels; NaN otherwise. */
const px = (value: string): number => {
  let v = value.trim().replace(/;$/, '')
  v = v.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => {
    const t = new RegExp(`${name}:\\s*([\\d.]+)px`).exec(tokens)
    return t ? `${t[1]}px` : 'NaN'
  })
  const calc = /^calc\((.*)\)$/.exec(v)
  if (calc) return calc[1]!.split('+').reduce((sum, part) => sum + px(part), 0)
  const m = /^([\d.]+)px$/.exec(v.trim())
  return m ? Number(m[1]) : Number.NaN
}

const MENU_BUTTON = 40 // IconButton visual width
const GAP = 8

describe('plan.css: the hero slot menu and the overline', () => {
  const menu = block('.plan-hero__menu')
  const inFlow = menu !== '' && !/position:\s*(absolute|fixed)/.test(menu)
  const reserve = /padding-inline-end:\s*([^;]+);/.exec(block('.plan-hero:has(.plan-hero__menu) .tile__overline'))

  it('the menu rule exists', () => {
    expect(menu).not.toBe('')
  })

  it('the overline makes room: shares a flex row with the menu, or reserves button width plus gap', () => {
    if (inFlow) {
      expect(menu).toMatch(/flex|grid/)
      return
    }
    expect(reserve, 'no padding-inline-end on .plan-hero:has(.plan-hero__menu) .tile__overline').not.toBeNull()
    expect(px(reserve![1]!)).toBeGreaterThanOrEqual(MENU_BUTTON + GAP)
  })
})
