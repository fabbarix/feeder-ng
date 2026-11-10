import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColorSwatches } from './ColorSwatches'

const swatches = [
  { value: '#2a7f62', name: 'Basil' },
  { value: '#d9482b', name: 'Tomato' },
  { value: '#e0a92f', name: 'Saffron' },
]

describe('ColorSwatches', () => {
  it('is a radiogroup of named swatches; the current colour is checked', () => {
    render(<ColorSwatches label="Accent" swatches={swatches} value="#d9482b" onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Accent' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Tomato' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Basil' })).toHaveAttribute('aria-checked', 'false')
  })

  it('click and arrows choose a swatch', async () => {
    const onChange = vi.fn()
    render(<ColorSwatches label="Accent" swatches={swatches} value="#2a7f62" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Saffron' }))
    expect(onChange).toHaveBeenLastCalledWith('#e0a92f')
    screen.getByRole('radio', { name: 'Basil' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('#d9482b')
  })

  it('has no Custom swatch unless allowed', () => {
    render(<ColorSwatches label="Accent" swatches={swatches} value="#2a7f62" onChange={() => {}} />)
    expect(screen.queryByRole('radio', { name: 'Custom' })).toBeNull()
  })

  it('shows Custom as selected when the value is not a preset', () => {
    render(<ColorSwatches label="Accent" swatches={swatches} value="#112233" allowCustom onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Custom' })).toHaveAttribute('aria-checked', 'true')
  })

  it('Custom opens a dialog with a hue slider and a hex field; Use colour applies a valid hex', async () => {
    const onChange = vi.fn()
    render(<ColorSwatches label="Accent" swatches={swatches} value="#2a7f62" allowCustom onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const dialog = screen.getByRole('dialog', { name: 'Custom colour' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(screen.getByRole('slider', { name: 'Hue' })).toBeInTheDocument()
    const hex = screen.getByRole('textbox', { name: 'Hex colour' })
    await userEvent.clear(hex)
    await userEvent.type(hex, '#2A7F99')
    await userEvent.click(screen.getByRole('button', { name: 'Use colour' }))
    expect(onChange).toHaveBeenCalledWith('#2a7f99')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('an invalid hex shows an error and disables Use colour', async () => {
    const onChange = vi.fn()
    render(<ColorSwatches label="Accent" swatches={swatches} value="#2a7f62" allowCustom onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const hex = screen.getByRole('textbox', { name: 'Hex colour' })
    await userEvent.clear(hex)
    await userEvent.type(hex, '#zzz')
    expect(hex).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Use colour' })).toBeDisabled()
  })

  it('cancelling the picker leaves the value alone and refocuses Custom', async () => {
    const onChange = vi.fn()
    render(<ColorSwatches label="Accent" swatches={swatches} value="#2a7f62" allowCustom onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    await userEvent.keyboard('{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Custom' })).toHaveFocus()
  })

  // R11a N8: the 7-character "Custom" overline did not fit the 40 px circle. The circle shows the Phosphor palette icon; the
  // word stays as the accessible name.
  it('the Custom swatch shows an icon, not text that could overflow its circle', () => {
    render(<ColorSwatches label="Accent" swatches={swatches} value="#2a7f62" allowCustom onChange={() => {}} />)
    const custom = screen.getByRole('radio', { name: 'Custom' })
    expect(custom.querySelector('svg')).not.toBeNull()
    expect(custom.textContent).toBe('')
    expect(custom.querySelector('.colour-swatch__text')).toBeNull()
  })
})
