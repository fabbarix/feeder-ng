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

  it("children start from the xs size token and grow to their own max (so three xs fields wrap on a 360 px phone, not squeeze)", () => {
    const d = declarations(css, '.field-row > *')
    expect(d['flex']).toBe('1 1 var(--field-size-xs)')
    expect(d['min-inline-size']).toBe('0')
  })

  it("align='end' lines the Button up with the controls", () => {
    expect(declarations(css, ".field-row[data-align='end']")['align-items']).toBe('flex-end')
  })

  it('has no media query: wrapping is intrinsic (flex-basis), not a breakpoint', () => {
    expect(css).not.toMatch(/@media/)
  })
})
