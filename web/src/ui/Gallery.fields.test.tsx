// R2-F: Gallery entries for the new props: field sizes, FieldRow, FormActions, block Button, compact Stepper, focus ring.
import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Gallery } from './Gallery'

describe.each(['light', 'dark'] as const)('Gallery fields (%s)', (scheme) => {
  const section = () => render(<Gallery />).container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!

  it.each(['Field sizes', 'FieldRow', 'FormActions'])('has a "%s" group', (name) => {
    expect(within(section()).getByRole('heading', { level: 3, name })).toBeInTheDocument()
  })

  it('shows every size on a TextField and the compact stepper NumberField', () => {
    const s = section()
    for (const size of ['xs', 'sm', 'md', 'lg', 'full']) expect(s.querySelector(`.ui-field[data-size="${size}"]`), size).not.toBeNull()
    expect(s.querySelector('.ui-field--stepper[data-size="xs"]')).not.toBeNull()
    expect(s.querySelector('.stepper[data-size="sm"]')).not.toBeNull()
  })

  it('shows a FieldRow with several fields and a FormActions with all four slots', () => {
    const s = section()
    expect(s.querySelector('.field-row')!.children.length).toBeGreaterThanOrEqual(3)
    const actions = s.querySelector('.form-actions')!
    for (const slot of ['destructive', 'tertiary', 'secondary', 'primary']) expect(actions.querySelector(`.form-actions__${slot}`), slot).not.toBeNull()
  })

  it('shows a block Button (always) and a disabled TimeField (muted, not dimmed)', () => {
    const s = section()
    expect(s.querySelector('button[data-block="always"]')).not.toBeNull()
    expect(s.querySelector('.time-field[data-disabled]')).not.toBeNull()
  })

  it('shows a disabled Segmented with a selected option', () => {
    expect(section().querySelector('.segmented[data-disabled] [aria-checked="true"]')).not.toBeNull()
  })

  it('has a field in the focus state shown statically (data-gallery-focus) so the ring is visible in the catalogue', () => {
    expect(section().querySelector('[data-gallery-focus]')).not.toBeNull()
  })
})
