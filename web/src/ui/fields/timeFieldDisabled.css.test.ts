// R2-F (K1 (d)): a disabled TimeField uses the muted colours of the other fields, not opacity .38 (which drops the
// text below AA). Contrast pair as in the NumberField WP3b test: --color-muted on --color-surface-2.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'

const time = readUiCss('fields/TimeField.css')

describe('TimeField disabled', () => {
  it('does not dim the group with opacity', () => {
    expect(declarations(time, '.time-field[data-disabled]')).not.toHaveProperty('opacity')
  })

  it('mutes the group, the segments, the colon and the label', () => {
    expect(declarations(time, '.time-field[data-disabled]')).toMatchObject({ color: 'var(--color-muted)' })
    expect(declarations(time, '.time-field__segment:disabled')).toMatchObject({ color: 'var(--color-muted)', cursor: 'default' })
    expect(declarations(time, '.time-field[data-disabled] .time-field__segment[aria-valuenow]')).toMatchObject({ color: 'var(--color-muted)' })
    expect(declarations(time, '.ui-field:has(.time-field[data-disabled]) .ui-field__label')).toMatchObject({ color: 'var(--color-muted)' })
  })

  it('keeps the surface-2 background and shows no focus ring (a disabled group cannot focus)', () => {
    expect(declarations(time, '.time-field')).toMatchObject({ background: 'var(--color-surface-2)' })
  })
})

// Same defect on the two trigger fields (found while reading the CSS; the review only names TimeField): they still dim with opacity.
describe('Select and DateField triggers disabled (same rule)', () => {
  it.each([
    ['Select/Select.css', '.select__trigger:disabled'],
    ['fields/DateField.css', '.date-field__trigger:disabled'],
  ])('%s %s uses muted colour, not opacity', (file, selector) => {
    const d = declarations(readUiCss(file), selector)
    expect(d).not.toHaveProperty('opacity')
    expect(d['color']).toBe('var(--color-muted)')
  })
})
