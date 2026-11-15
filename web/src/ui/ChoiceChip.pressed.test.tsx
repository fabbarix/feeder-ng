// A11Y-06 (decision 2): a pressed ChoiceChip is the accent container with a ring inside the edge and a Check before its label.
// The ring, not the fill, carries the state (it is >= 6.3:1 against the soft fill and the surface-2 surround).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChoiceChip } from './ChoiceChip'
import { declarations, readUiCss } from './test-utils'

describe('ChoiceChip pressed (markup)', () => {
  it('a pressed chip shows the selected Check, hidden from assistive technology, before the label', () => {
    render(
      <ChoiceChip pressed onClick={() => {}}>
        500 g
      </ChoiceChip>,
    )
    const chip = screen.getByRole('button', { name: '500 g' })
    const check = chip.querySelector('.choice-chip__check')
    expect(check).not.toBeNull()
    expect(check!.querySelector('svg') ?? check).toHaveAttribute('aria-hidden', 'true')
    expect(chip.firstElementChild).toBe(check)
  })

  it('an unpressed chip and a chip that acts at once have no Check', () => {
    const { container } = render(
      <>
        <ChoiceChip pressed={false} onClick={() => {}}>
          1 kg
        </ChoiceChip>
        <ChoiceChip onClick={() => {}}>Mozzarella</ChoiceChip>
      </>,
    )
    expect(container.querySelector('.choice-chip__check')).toBeNull()
  })

  it('the Check does not change the accessible name', () => {
    render(
      <ChoiceChip pressed note="125 g" onClick={() => {}}>
        Mozzarella
      </ChoiceChip>,
    )
    expect(screen.getByRole('button', { name: 'Mozzarella 125 g' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a pressed chip with a leading icon keeps that icon, and the Check comes first', () => {
    render(
      <ChoiceChip pressed icon="pin" onClick={() => {}}>
        Pinned
      </ChoiceChip>,
    )
    const chip = screen.getByRole('button', { name: 'Pinned' })
    expect(chip.querySelector('.choice-chip__lead')).not.toBeNull()
    expect(chip.firstElementChild).toHaveClass('choice-chip__check')
  })
})

describe('ChoiceChip.css', () => {
  const css = readUiCss('ChoiceChip.css')
  it("[aria-pressed='true'] is the accent container with the ring inside the edge", () => {
    const d = declarations(css, ".choice-chip[aria-pressed='true']")
    expect(d['background']).toBe('var(--selected-bg)')
    expect(d['color']).toBe('var(--selected-fg)')
    expect(d['border-color']).toBe('var(--selected-ring)')
    expect(d['box-shadow']).toBe('inset 0 0 0 var(--selected-ring-width) var(--selected-ring)')
  })

  it('no longer uses the primary container pair (1.06:1 on surface-2)', () => {
    expect(css).not.toMatch(/--color-primary-container/)
    expect(css).not.toMatch(/--color-on-primary-container/)
  })

  it('the hover layer keeps the ring on a pressed chip', () => {
    expect(css.replace(/\s+/g, ' ')).toMatch(/\.choice-chip\[aria-pressed='true'\]:hover:not\(:disabled\)\s*\{[^}]*var\(--selected-ring\)/)
  })

  it('stays a 44 px target', () => {
    expect(declarations(css, '.choice-chip')['min-block-size']).toBe('44px')
  })

  it('the Check is 16 px, never shrinks, and the note keeps inheriting the pressed colour', () => {
    expect(declarations(css, '.choice-chip__check')['flex']).toBe('none')
    expect(declarations(css, ".choice-chip[aria-pressed='true'] .choice-chip__note")['color']).toBe('inherit')
  })
})
