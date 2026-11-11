// R2-F (F-01): FieldRow lays several short fields on one row and wraps on phones.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NumberField } from './NumberField'
import { FieldRow } from './FieldRow'
import { declarations, readUiCss } from '../test-utils'

const noop = () => {}

describe('FieldRow', () => {
  it('renders its fields as children of one row element', () => {
    const { container } = render(
      <FieldRow>
        <NumberField label="Yield" value={4} onChange={noop} size="xs" />
        <NumberField label="Cool-down" value={30} onChange={noop} size="xs" />
      </FieldRow>,
    )
    const row = container.querySelector('.field-row')!
    expect(row).not.toBeNull()
    expect(row.children).toHaveLength(2)
    expect(screen.getByLabelText('Yield')).toBeInTheDocument()
    expect(screen.getByLabelText('Cool-down')).toBeInTheDocument()
  })

  it('with a label it is a named group; without it, no group role is added', () => {
    const { rerender } = render(<FieldRow><NumberField label="Length" value={2} onChange={noop} /></FieldRow>)
    expect(screen.queryByRole('group', { name: 'Item code' })).toBeNull()
    rerender(<FieldRow label="Item code"><NumberField label="Length" value={2} onChange={noop} /></FieldRow>)
    expect(screen.getByRole('group', { name: 'Item code' })).toBeInTheDocument()
  })

  it("align='end' is a data attribute for a trailing Button; the default sets none", () => {
    const { container, rerender } = render(<FieldRow><span /></FieldRow>)
    expect(container.querySelector('.field-row')).not.toHaveAttribute('data-align')
    rerender(<FieldRow align="end"><span /></FieldRow>)
    expect(container.querySelector('.field-row')).toHaveAttribute('data-align', 'end')
  })
})

describe('FieldRow.css', () => {
  const css = readUiCss('fields/FieldRow.css')

  it('is a wrapping flex row with the space-3 gap', () => {
    expect(declarations(css, '.field-row')).toMatchObject({ display: 'flex', 'flex-wrap': 'wrap', gap: 'var(--space-3)', 'align-items': 'flex-start' })
  })

  it('children start from their own size (flex-basis auto, no grow), not a shared 112 px basis', () => {
    const d = declarations(css, '.field-row > *')
    expect(d['flex']).toBe('0 1 auto')
    expect(d['flex']).not.toMatch(/field-size/)
    expect(d['min-inline-size']).toBe('0')
  })

  it('a row wraps before it shrinks a field below its size: every cap token is a max-inline-size in Field.css (incl. the stepper tokens)', () => {
    const field = readUiCss('fields/Field.css')
    for (const sel of [".ui-field[data-size='xs']", ".ui-field[data-size='sm']", ".ui-field[data-size='md']", ".ui-field[data-size='lg']", ".ui-field--stepper[data-size='xs']", ".ui-field--stepper[data-size='sm']"]) {
      expect(declarations(field, sel)['max-inline-size'], sel).toMatch(/field-size/)
    }
    expect(declarations(css, '.field-row')['flex-wrap']).toBe('wrap')
  })

  it("align='end' lines the Button up with the controls", () => {
    expect(declarations(css, ".field-row[data-align='end']")['align-items']).toBe('flex-end')
  })

  it('has no media query: wrapping is intrinsic (flex-basis), not a breakpoint', () => {
    expect(css).not.toMatch(/@media/)
  })
})
