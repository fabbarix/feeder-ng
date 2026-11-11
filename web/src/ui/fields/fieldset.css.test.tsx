// R2-F (F-05 / F-09, Segmented label + fieldset reset): the Ingredient Base Unit rendered a native <fieldset> frame (square 1 px
// border, legend cut into it). The primitive owns the reset so a fieldset/legend pair looks like a field: Field.css resets
// `fieldset.ui-field` and styles `legend` as `.ui-field__label`. Segmented keeps its radiogroup and its own visible label.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { Segmented } from './Segmented'

describe('fieldset reset in Field.css', () => {
  const field = readUiCss('fields/Field.css')

  it('fieldset.ui-field has no border, padding, margin and may shrink', () => {
    expect(declarations(field, 'fieldset.ui-field')).toMatchObject({
      border: '0',
      padding: '0',
      margin: '0',
      'min-inline-size': '0',
    })
  })

  it('legend.ui-field__label sits like the label: padding 0, no float/inset', () => {
    expect(declarations(field, 'legend.ui-field__label')).toMatchObject({ padding: '0', 'margin-block-end': 'var(--space-1)' })
  })
})

describe('Segmented label', () => {
  it('has a visible label that names the radiogroup', () => {
    render(<Segmented label="Base Unit" value="g" onChange={() => {}} options={[{ value: 'g', label: 'g' }, { value: 'ml', label: 'ml' }]} />)
    expect(screen.getByRole('radiogroup', { name: 'Base Unit' })).toBeInTheDocument()
    expect(screen.getByText('Base Unit')).toBeVisible()
  })

  it('a disabled Segmented is muted with colours, not opacity (WP3b)', () => {
    const css = readUiCss('fields/Segmented.css')
    expect(declarations(css, ".segmented[data-disabled]")).not.toHaveProperty('opacity')
    expect(declarations(css, '.segmented__option:disabled')).not.toHaveProperty('opacity')
  })

  it('a disabled Segmented has a second cue beyond muted text: the selected pill is flattened (no shadow, no surface fill)', () => {
    const css = readUiCss('fields/Segmented.css')
    const d = declarations(css, ".segmented[data-disabled] .segmented__option[aria-checked='true']")
    expect(d['box-shadow']).toBe('none')
    expect(d['background']).toBe('transparent')
    expect(declarations(css, '.segmented[data-disabled]')['background']).toBe('transparent')
    expect(declarations(css, '.segmented[data-disabled]')['border-color']).toBe('var(--color-outline)')
  })

  it('the enabled track has a transparent border of the same width, so disabling does not shift layout', () => {
    expect(declarations(readUiCss('fields/Segmented.css'), '.segmented')['border']).toBe('1.5px solid transparent')
  })
})
