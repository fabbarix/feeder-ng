// DS-SHOP round 2 (docs/design/system.md §5 chips, the Shop mockups): `appearance="chip"` is the compact picker of a toolbar: a pill
// trigger that shows only its value (and a leading icon), sized by its content, never capped like a 320 px field. The label is still
// the accessible name, and the list opens exactly as before.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select } from './Select'
import { declarations, readUiCss } from '../test-utils'

const css = readUiCss('Select/Select.css')
const options = [
  { value: 'a', label: 'Until Wed 18' },
  { value: 'b', label: 'Until Thu 19' },
]

describe('Select appearance="chip"', () => {
  it('the trigger is still a combobox named by its label, but the label is visually hidden', () => {
    const { container } = render(<Select label="Shop for" appearance="chip" options={options} value="a" onChange={() => {}} />)
    const trigger = screen.getByRole('combobox', { name: 'Shop for' })
    expect(trigger).toHaveTextContent('Until Wed 18')
    expect(trigger).toHaveAttribute('data-appearance', 'chip')
    expect(container.querySelector('.ui-field__label')).toHaveClass('visually-hidden')
  })

  it('the default appearance keeps its visible label', () => {
    const { container } = render(<Select label="Shop for" options={options} value="a" onChange={() => {}} />)
    expect(container.querySelector('.ui-field__label')).not.toHaveClass('visually-hidden')
    expect(screen.getByRole('combobox')).not.toHaveAttribute('data-appearance')
  })

  it('the frame is not capped by a field size (data-appearance on the frame, no data-size)', () => {
    const { container } = render(<Select label="Shop for" appearance="chip" options={options} value="a" onChange={() => {}} />)
    expect(container.querySelector('.ui-field')).toHaveAttribute('data-appearance', 'chip')
    expect(container.querySelector('.ui-field')).not.toHaveAttribute('data-size')
  })

  it('an icon shows before the value', () => {
    render(<Select label="Shop for" appearance="chip" icon="plan" options={options} value="a" onChange={() => {}} />)
    expect(screen.getByRole('combobox').querySelector('.select__leading svg')).toBeInTheDocument()
  })

  it('opens and picks like any Select', async () => {
    const onChange = vi.fn()
    render(<Select label="Shop for" appearance="chip" options={options} value="a" onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Shop for' }))
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Until Thu 19' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('the stylesheet: a pill sized by its content with a 44 px target and a muted ring, ellipsis when it must shrink', () => {
    const t = declarations(css, ".select__trigger[data-appearance='chip']")
    expect(t['inline-size']).toBe('auto')
    expect(t['min-block-size']).toBe('44px')
    expect(t['border-radius']).toBe('var(--radius-pill)')
    expect(t['background']).toBe('var(--color-surface)')
    const frame = declarations(css, ".ui-field[data-appearance='chip']")
    expect(frame['min-inline-size']).toBe('0')
    expect(frame['max-inline-size'] ?? 'none').toBe('none')
  })
})
