// A11Y-06 (decision 2) and A11Y-09 for the Segmented: the chosen option is the accent container with a ring inside the edge and a Check
// before the label; an option never wraps (P30 guards it in a real layout); a compact Segmented has no Check; a coarse pointer gets
// 48 px abutting hit areas. Also SAFE-04: `error` sets aria-invalid on the group.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { Segmented } from './Segmented'

const options = [
  { value: 'active', label: 'Active' },
  { value: 'passive', label: 'Passive' },
  { value: 'advance', label: 'Advance Step' },
]
const raw = readUiCss('fields/Segmented.css')
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ')

describe('Segmented selected option (markup)', () => {
  it('the checked option of a full-width Segmented shows the selected icon, hidden from assistive technology', () => {
    render(<Segmented label="Kind" value="passive" onChange={() => {}} options={options} />)
    const checked = screen.getByRole('radio', { name: 'Passive' })
    const check = checked.querySelector('.segmented__check')
    expect(check).not.toBeNull()
    expect(check!.tagName.toLowerCase()).toBe('svg')
    expect(check).toHaveAttribute('aria-hidden', 'true')
    // before the label
    expect(checked.firstElementChild).toBe(check)
  })

  it('only the checked option has it', () => {
    const { container } = render(<Segmented label="Kind" value="passive" onChange={() => {}} options={options} />)
    expect(container.querySelectorAll('.segmented__check')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'Active' }).querySelector('.segmented__check')).toBeNull()
  })

  it('the radio is still named by its label alone', () => {
    render(<Segmented label="Kind" value="advance" onChange={() => {}} options={options} />)
    expect(screen.getByRole('radio', { name: 'Advance Step' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Advance Step' })).toHaveAttribute('aria-checked', 'true')
  })

  it('a compact Segmented has no Check: the ring alone marks the choice', () => {
    const { container } = render(<Segmented label="Kind" compact value="passive" onChange={() => {}} options={options} />)
    expect(container.querySelector('.segmented__check')).toBeNull()
  })

  it('SAFE-04: an error sets aria-invalid on the group and is described by the error line', () => {
    render(<Segmented label="Kind" value="passive" onChange={() => {}} options={options} error="Choose a kind." />)
    const group = screen.getByRole('radiogroup', { name: 'Kind' })
    expect(group).toHaveAttribute('aria-invalid', 'true')
    const described = group.getAttribute('aria-describedby') ?? ''
    expect(described.split(' ').some((id) => document.getElementById(id)?.textContent?.includes('Choose a kind.'))).toBe(true)
  })
})

describe('Segmented.css selected option', () => {
  it('is the accent container with a ring inside the edge, and no elevation', () => {
    const d = declarations(css, ".segmented__option[aria-checked='true']")
    expect(d['background']).toBe('var(--selected-bg)')
    expect(d['color']).toBe('var(--selected-fg)')
    expect(d['box-shadow']).toBe('inset 0 0 0 var(--selected-ring-width) var(--selected-ring)')
    expect(norm(css)).not.toMatch(/\.segmented__option\[aria-checked='true'\]\s*\{[^}]*--elev-1/)
  })

  it('an option never wraps: it sizes to its label and shares the spare width', () => {
    const d = declarations(css, '.segmented__option')
    expect(d['white-space']).toBe('nowrap')
    expect(d['flex']).toBe('1 1 auto')
    expect(d['display']).toBe('inline-flex')
    expect(d['gap']).toBe('var(--space-1)')
  })

  it('a field narrower than 18 rem hides the Check and tightens the padding', () => {
    const m = /@container\s*\(max-width:\s*18rem\)\s*\{([\s\S]*?\})\s*\}/.exec(css)
    expect(m, 'an @container (max-width: 18rem) block').not.toBeNull()
    expect(m![1]).toMatch(/\.segmented__check\s*\{[^}]*display:\s*none/)
    expect(m![1]).toMatch(/\.segmented__option\s*\{[^}]*padding-inline:\s*var\(--space-2\)/)
  })

  it('the container query sits on the field of a full-width Segmented, never on a compact one (it would collapse max-content)', () => {
    expect(norm(css)).toMatch(/\.ui-field:has\(> \.segmented:not\(\[data-compact\]\)\)\s*\{[^}]*container-type:\s*inline-size/)
    expect(norm(css)).not.toMatch(/\.segmented\[data-compact\][^{]*\{[^}]*container-type/)
  })

  it('the ring goes round the whole track while an option has focus, and the option draws none', () => {
    expect(declarations(css, '.segmented__option:focus-visible')['outline']).toBe('none')
    const track = declarations(css, '.segmented:has(.segmented__option:focus-visible)')
    expect(track['outline']).toBe('var(--focus-ring-width) solid var(--focus-ring-color)')
    expect(track['outline-offset']).toBe('var(--focus-ring-offset)')
  })

  it('compact options still size to their labels (flex none)', () => {
    expect(declarations(css, ".segmented[data-compact] .segmented__option")['flex']).toBe('none')
    expect(declarations(css, ".segmented[data-compact] .segmented__option")['white-space']).toBe('nowrap')
  })
})

describe('Segmented.css on a coarse pointer (A11Y-09)', () => {
  const coarse = /@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
  it('has a coarse block', () => {
    expect(coarse).not.toBe('')
  })
  it('each option draws a 48 px high hit area with ::after, abutting its neighbours', () => {
    expect(norm(coarse)).toMatch(/\.segmented__option\s*\{[^}]*position:\s*relative/)
    const after = /\.segmented__option::after\s*\{([^}]*)\}/.exec(coarse)?.[1] ?? ''
    expect(after).toMatch(/content:\s*''/)
    expect(after).toMatch(/position:\s*absolute/)
    expect(norm(after)).toMatch(/inset:\s*calc\(-1 \* var\(--space-1\)\) calc\(-0\.5 \* var\(--space-1\)\)/)
  })
})
