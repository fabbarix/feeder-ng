// R2-F (F-01): a NumberField with a stepper is a compact group [−] 7 [+] (40 px buttons, tabular value, unit inside), never
// stretched; Stepper gets the same compact variant (size="sm").
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stepper } from '../Stepper'
import { declarations, readUiCss } from '../test-utils'
import { NumberField } from './NumberField'

const noop = () => {}
const field = readUiCss('fields/Field.css')
const stepper = readUiCss('Stepper.css')
const iconButton = readUiCss('IconButton.css')

describe('NumberField with a stepper', () => {
  it('marks the frame as a stepper group so xs is 136 px, not 112', () => {
    const { container } = render(<NumberField label="Servings" value={4} onChange={noop} size="xs" />)
    expect(container.firstElementChild).toHaveClass('ui-field--stepper')
    expect(container.firstElementChild).toHaveAttribute('data-size', 'xs')
  })

  it('hideStepper drops the stepper class (a plain digit field is 112 px at xs)', () => {
    const { container } = render(<NumberField label="Digits" value={4} onChange={noop} size="xs" hideStepper />)
    expect(container.firstElementChild).not.toHaveClass('ui-field--stepper')
  })

  it('keeps the − and + buttons and the unit inside the control', () => {
    const { container } = render(<NumberField label="Servings" value={4} onChange={noop} unit="people" size="xs" />)
    const control = container.querySelector('.ui-field__control')!
    expect(control.querySelectorAll('button')).toHaveLength(2)
    expect(control).toHaveTextContent('people')
    expect(screen.getByRole('spinbutton')).toHaveClass('ui-field__number')
  })
})

describe('NumberField stepper CSS', () => {
  it('the stepper control has 40 px buttons and a centred tabular value', () => {
    expect(declarations(field, '.ui-field--stepper .icon-button')).toMatchObject({ 'inline-size': '40px', 'block-size': '40px' })
    expect(declarations(field, '.ui-field--stepper .ui-field__number')).toMatchObject({ 'text-align': 'center', 'font-variant-numeric': 'tabular-nums' })
  })

  it('the 40 px visual button is the IconButton default (no override of its hit area)', () => {
    expect(declarations(iconButton, '.icon-button')).toMatchObject({ 'inline-size': '40px', 'block-size': '40px' })
  })
})

describe('Stepper size="sm" (compact)', () => {
  it('renders data-size on the group; md is the default', () => {
    const { rerender } = render(<Stepper label="portions" value={4} onChange={noop} />)
    expect(screen.getByRole('group', { name: 'portions' })).toHaveAttribute('data-size', 'md')
    rerender(<Stepper label="portions" value={4} onChange={noop} size="sm" />)
    expect(screen.getByRole('group', { name: 'portions' })).toHaveAttribute('data-size', 'sm')
  })

  it('sm is compact: value title-3 not title-2, gap space-1, inline-flex so it never stretches', () => {
    const d = declarations(stepper, ".stepper[data-size='sm']")
    expect(d['gap']).toBe('var(--space-1)')
    expect(declarations(stepper, ".stepper[data-size='sm'] .stepper__value")['font-size']).toBe('var(--text-title-3-size)')
    expect(declarations(stepper, '.stepper')['display']).toBe('inline-flex')
  })

  it('the Stepper value uses the single focus ring token, not its own outline', () => {
    const d = declarations(stepper, '.stepper__value:focus-visible')
    expect(d['box-shadow']).toBe('var(--focus-ring)')
    expect(d['outline'] ?? 'none').toBe('none')
  })
})
