// B9-17 (DS-08, DS-11, VC6, DS-04): the MemberPill keeps its look and grows with the text.
//   selected={false} (B9-07) stays: outlined and struck through, no opacity (MemberPill.ds.test.tsx holds it). This file adds the shape
//   rules every pill follows: a minimum height (never fixed), a name that truncates inside its line, and no interactivity of its own
//   (a pill is a span; the button that holds it is the caller's, which is why the pill is not a focus scope).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { MemberPill } from './MemberPill'

const css = readUiCss('MemberPill/MemberPill.css').replace(/\/\*[\s\S]*?\*\//g, '')

describe('MemberPill shape', () => {
  it('is a span with the first name, never a button, and not a focus scope', () => {
    const { container } = render(<MemberPill name="Ben Carter" colour="#3366cc" />)
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('.member-pill')?.tagName).toBe('SPAN')
    expect(container.querySelector('.member-pill')).not.toHaveAttribute('data-focus-scope')
    expect(screen.getByText('Ben')).toBeInTheDocument()
  })

  it('has no fixed height: the avatar sets the floor and a larger browser text size grows the pill (DS-08)', () => {
    const pill = declarations(css, '.member-pill')
    expect(pill['block-size']).toBeUndefined()
    expect(pill['height']).toBeUndefined()
  })

  it('never exceeds its line and the name ends in an ellipsis (a long first name does not push the page sideways: DS-04)', () => {
    expect(declarations(css, '.member-pill')['max-inline-size']).toBe('100%')
    const name = declarations(css, '.member-pill__name')
    expect(name['min-inline-size']).toBe('0')
    expect(name['overflow']).toBe('hidden')
    expect(name['text-overflow']).toBe('ellipsis')
    expect(name['white-space']).toBe('nowrap')
  })

  it('is a full pill: fully rounded, with the Member colour as the start accent only', () => {
    const pill = declarations(css, '.member-pill')
    expect(pill['border-radius']).toBe('var(--radius-pill)')
    expect(pill['border-inline-start']).toBe('3px solid var(--member-colour)')
  })

  it('the unselected pill keeps B9-07\'s outline and strike-through and gains no fade', () => {
    const off = declarations(css, ".member-pill[data-selected='false']")
    expect(off['text-decoration']).toBe('line-through')
    expect(off['box-shadow']).toBe('inset 0 0 0 1px var(--color-outline)')
    expect(css).not.toMatch(/opacity\s*:/)
  })
})
