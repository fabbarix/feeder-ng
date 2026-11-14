// B9-07 (DS-11): a pressed pill is not shown by fading. `selected={false}` is an outlined pill: transparent fill, a 1 px --color-outline ring,
// the name muted and struck through, the avatar on surface-2 with a muted letter; no opacity (the faded name measured 2.8:1). The
// Settings "Who eats it" pills (features/settings, B9-10) reuse it. Scenario: In the Meal Slot editor, a Member who does not eat the Side
// is shown outlined and struck through: this file holds the primitive half, the Settings CSS test the screen half.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { MemberPill } from './MemberPill'

const css = readUiCss('MemberPill/MemberPill.css')

describe('MemberPill selected (DS-11)', () => {
  it('marks an unselected pill with data-selected="false"; a pill without the prop, and selected, are the filled pill', () => {
    const off = render(<MemberPill name="Ben" colour="#3366cc" selected={false} />).container.querySelector('.member-pill')!
    expect(off.getAttribute('data-selected')).toBe('false')
    const on = render(<MemberPill name="Ben" colour="#3366cc" selected />).container.querySelector('.member-pill')!
    expect(on.getAttribute('data-selected')).not.toBe('false')
    const plain = render(<MemberPill name="Ben" colour="#3366cc" />).container.querySelector('.member-pill')!
    expect(plain.hasAttribute('data-selected')).toBe(false)
  })

  it('an unselected pill is outlined, not faded: transparent fill, 1 px outline ring, muted struck-through name', () => {
    const pill = declarations(css, ".member-pill[data-selected='false']")
    expect(pill['background']).toBe('transparent')
    expect(pill['box-shadow']).toBe('inset 0 0 0 1px var(--color-outline)')
    expect(pill['color']).toBe('var(--color-muted)')
    expect(pill['border-inline-start-color']).toBe('var(--color-line)')
    expect(pill['text-decoration']).toBe('line-through')
    expect(pill['opacity']).toBeUndefined()
  })

  it('its avatar sits on surface-2 with a muted letter and no ring', () => {
    const avatar = declarations(css, ".member-pill[data-selected='false'] .avatar")
    expect(avatar['background']).toBe('var(--color-surface-2)')
    expect(avatar['color']).toBe('var(--color-muted)')
    expect(avatar['box-shadow']).toBe('none')
  })

  it('the stylesheet fades nothing: no opacity anywhere in MemberPill.css', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/opacity\s*:/)
  })
})
