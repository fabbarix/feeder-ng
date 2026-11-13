// hf-recipes-filter: Segmented `compact` (sized by its options, for a toolbar row) and `labelHidden` (the label stays the
// radiogroup's name) (docs/design/recipes-filter.md 7.3).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readUiCss } from '../test-utils'
import { Segmented } from './Segmented'

const options = [
  { value: 'plannable', label: 'Recipes' },
  { value: 'base', label: 'Base recipes' },
]
const css = readUiCss('fields/Segmented.css').replace(/\/\*[\s\S]*?\*\//g, '')
const block = (selector: RegExp) => selector.exec(css)?.[1] ?? ''

describe('Segmented labelHidden', () => {
  it('keeps the label as the radiogroup name, visually hidden', () => {
    const { container } = render(<Segmented label="Kind" labelHidden value="plannable" onChange={() => {}} options={options} />)
    expect(screen.getByRole('radiogroup', { name: 'Kind' })).toBeInTheDocument()
    expect(container.querySelector('.ui-field__label')).toHaveClass('visually-hidden')
  })
  it('shows the label by default', () => {
    const { container } = render(<Segmented label="Kind" value="plannable" onChange={() => {}} options={options} />)
    expect(container.querySelector('.ui-field__label')).not.toHaveClass('visually-hidden')
  })
})

describe('Segmented compact', () => {
  it('marks the group data-compact', () => {
    render(<Segmented label="Kind" compact value="plannable" onChange={() => {}} options={options} />)
    expect(screen.getByRole('radiogroup')).toHaveAttribute('data-compact')
  })
  it('is not compact by default', () => {
    render(<Segmented label="Kind" value="plannable" onChange={() => {}} options={options} />)
    expect(screen.getByRole('radiogroup')).not.toHaveAttribute('data-compact')
  })
  it('a compact group is as wide as its options, which do not stretch, with token padding', () => {
    const group = block(/\.segmented\[data-compact\]\s*\{([^}]*)\}/)
    expect(group).toMatch(/inline-size:\s*max-content/)
    const option = block(/\.segmented\[data-compact\]\s+\.segmented__option\s*\{([^}]*)\}/)
    expect(option).toMatch(/flex:\s*none/)
    expect(option).toMatch(/padding:\s*0 var\(--space-2\)/)
    expect(option).toMatch(/white-space:\s*nowrap/)
  })
  it('the frame of a compact group does not stretch either', () => {
    expect(css).toMatch(/\.ui-field:has\(> \.segmented\[data-compact\]\)\s*\{[^}]*inline-size:\s*max-content/)
  })
})
