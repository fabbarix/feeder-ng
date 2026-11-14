// The user's report on beta.9 (B9-08, Today at 375 px): the hero's Recipe name ran under its ⋮ menu button. The menu and the
// eyebrow now share the hero's first grid row (eyebrow | button, centred on each other), and every other child of the hero,
// the name's block among them, spans the whole width in a later row, so the name's box never shares a row with the button.
// jsdom does not lay out: the DOM structure is rendered and the grid placement is read from the stylesheet.
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { declarations } from '../../ui/test-utils'
import { TonightHero } from './components/TonightHero'
import { meal, slot } from './test-utils'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('plan.css').replace(/\/\*[\s\S]*?\*\//g, '')
const longName = 'Roasted two-colour cauliflower with sweet peppers and capers' // 60 characters
const hero = (name = 'Slow cooker beef and barley stew') =>
  render(
    <TonightHero
      slot={slot({ at: '2026-11-10T19:30:00Z', time: '19:30', meal: meal({ cookMinutes: 45, recipeName: name }) })}
      now={new Date('2026-11-10T17:00:00Z')}
      onCook={vi.fn()}
      onYesCooked={vi.fn()}
      onAdjust={vi.fn()}
      menu={{ onNotCookedSlot: vi.fn() }}
    />,
  ).container

describe("the hero's Recipe name never runs under its menu button", () => {
  it('the menu and the eyebrow are direct children of the hero; the name is inside another child (the body)', () => {
    const tile = hero(longName).querySelector('.plan-hero')!
    const kids = [...tile.children]
    const menu = tile.querySelector(':scope > .plan-hero__menu')
    const eyebrow = tile.querySelector(':scope > .tile__overline')
    expect(menu).not.toBeNull()
    expect(eyebrow).not.toBeNull()
    const name = tile.querySelector('.plan-hero__name')!
    expect(name.textContent).toBe(longName)
    const nameChild = kids.find((k) => k.contains(name))!
    expect(nameChild).not.toBe(menu)
    expect(nameChild).not.toBe(eyebrow)
    expect(nameChild.classList.contains('plan-hero__body')).toBe(true)
  })

  it('with a menu the hero is two columns: eyebrow | button in row 1, every other child across both columns', () => {
    expect(declarations(css, '.plan-hero:has(> .plan-hero__menu)')['grid-template-columns']).toBe('minmax(0, 1fr) auto')
    expect(declarations(css, '.plan-hero:has(> .plan-hero__menu) > *')['grid-column']).toBe('1 / -1')
    const eyebrow = declarations(css, '.plan-hero:has(> .plan-hero__menu) > .tile__overline')
    expect(eyebrow).toMatchObject({ 'grid-column': '1', 'grid-row': '1', 'align-self': 'center' })
  })

  it('the menu is in the flow (not positioned over the content), in row 1 of the end column, centred on the eyebrow', () => {
    const menu = declarations(css, '.plan-hero:has(> .plan-hero__menu) > .plan-hero__menu')
    expect(menu).toMatchObject({ 'grid-column': '2', 'grid-row': '1', 'align-self': 'center' })
    expect(css).not.toMatch(/\.plan-hero__menu\s*\{[^}]*position:\s*(absolute|fixed)/)
  })

  it('the hero itself is the grid (the plan.css .plan-hero rule), so the rows above apply', () => {
    expect(declarations(css, '.plan-hero')['display']).toBe('grid')
  })
})
