// B9-16: the Gallery's "Controls" group holds every control of the package in one block, in each scheme.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ControlsGalleryGroup } from './GalleryControls'

describe('Gallery: Controls group', () => {
  it('shows the ruled controls on every surface, the selected states, each Stepper size, IconSets, Disclosures, errors and the new fields', () => {
    const { container } = render(<ControlsGalleryGroup />)
    const group = container.querySelector('[data-gallery-group="controls"]') as HTMLElement
    expect(within(group).getByRole('heading', { name: 'Controls' })).toBeInTheDocument()
    for (const surface of ['page', 'surface tile', 'Step card, surface-2', 'soft tile', 'danger tile', 'spoil tile', 'info tile']) {
      expect(screen.getByRole('searchbox', { name: `Search (${surface})` })).toBeInTheDocument()
      expect(screen.getByRole('radiogroup', { name: `Step kind (${surface})` })).toBeInTheDocument()
    }
    expect(container.querySelectorAll('.choice-chip[aria-pressed="true"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.icon-button[aria-pressed="true"]').length).toBeGreaterThan(0)
    expect(container.querySelector('.radio-card[aria-checked="true"]')).not.toBeNull()
    for (const size of ['md', 'sm', 'xs', 'lg']) expect(container.querySelector(`.stepper[data-size="${size}"]`), size).not.toBeNull()
    expect(screen.getByRole('group', { name: 'Actions for Soup' }).querySelectorAll('button')).toHaveLength(3)
    expect(screen.getByRole('group', { name: 'Actions for Pasta' }).querySelectorAll('button')).toHaveLength(4)
    expect(container.querySelectorAll('[data-disclosure]')).toHaveLength(3)
    expect(screen.getByRole('alert')).toHaveClass('form-error')
    expect(screen.getByRole('textbox', { name: 'Currency' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: 'Step' }).tagName).toBe('TEXTAREA')
    expect(container.querySelector('[data-range-start]')).toBeNull() // the calendar is closed until opened
    expect(screen.getByRole('group', { name: 'Lead time' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Duration' })).toBeInTheDocument()
  })
})
