// TagColourPicker (TG-UI): ten named swatches in a radiogroup, roving arrows, no native colour control.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TagColourPicker } from './TagColourPicker'

const NAMES = ['Tomato', 'Apricot', 'Mustard', 'Olive', 'Sage', 'Teal', 'Sky', 'Blue', 'Plum', 'Rose']
const IDS = NAMES.map((n) => n.toLowerCase())

function Controlled({ initial = 'tomato', onChange, ...rest }: { initial?: string; onChange?: (id: string) => void; disabled?: boolean; error?: string; helper?: string; preview?: React.ReactNode }) {
  const [value, setValue] = useState(initial)
  return <TagColourPicker label="Colour" value={value} onChange={(id) => { setValue(id); onChange?.(id) }} {...rest} />
}
const radios = () => screen.getAllByRole('radio')

describe('TagColourPicker', () => {
  it('is a radiogroup named by its label, with ten radios named Tomato to Rose in order', () => {
    render(<Controlled />)
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toBeInTheDocument()
    expect(radios().map((r) => r.getAttribute('aria-label'))).toEqual(NAMES)
    expect(screen.getByRole('radio', { name: 'Sage' })).toBeInTheDocument()
  })
  it('exactly the chosen swatch is checked, ticked, and carries its colour', () => {
    const { container } = render(<Controlled initial="sage" />)
    const checked = radios().filter((r) => r.getAttribute('aria-checked') === 'true')
    expect(checked.map((r) => r.getAttribute('aria-label'))).toEqual(['Sage'])
    expect(checked[0]!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('.tag-swatch svg')).toHaveLength(1)
    expect(radios().map((r) => r.getAttribute('data-tag-colour'))).toEqual(IDS)
  })
  it('an unknown value checks nothing and the first swatch is the tab stop', () => {
    render(<Controlled initial="chartreuse" />)
    expect(radios().filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(0)
    expect(radios().filter((r) => r.tabIndex === 0).map((r) => r.getAttribute('aria-label'))).toEqual(['Tomato'])
  })
  it('only the checked swatch is a tab stop', () => {
    render(<Controlled initial="plum" />)
    expect(radios().filter((r) => r.tabIndex === 0).map((r) => r.getAttribute('aria-label'))).toEqual(['Plum'])
  })
  it('clicking a swatch answers its id', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Teal' }))
    expect(onChange).toHaveBeenCalledWith('teal')
    expect(screen.getByRole('radio', { name: 'Teal' })).toHaveAttribute('aria-checked', 'true')
  })
  it('arrows select and move focus, and wrap', async () => {
    const onChange = vi.fn()
    render(<Controlled initial="tomato" onChange={onChange} />)
    screen.getByRole('radio', { name: 'Tomato' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('apricot')
    expect(screen.getByRole('radio', { name: 'Apricot' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('rose')
    expect(screen.getByRole('radio', { name: 'Rose' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith('tomato')
    await userEvent.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith('rose')
  })
  it('Home and End select the first and the last', async () => {
    const onChange = vi.fn()
    render(<Controlled initial="sky" onChange={onChange} />)
    screen.getByRole('radio', { name: 'Sky' }).focus()
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith('rose')
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith('tomato')
    expect(screen.getByRole('radio', { name: 'Tomato' })).toHaveFocus()
  })
  it('the swatches are real buttons: no native input, select or colour control', () => {
    const { container } = render(<Controlled />)
    expect(container.querySelector('input, select, textarea')).toBeNull()
    for (const r of radios()) expect(r.tagName.toLowerCase()).toBe('button')
  })
  it('has no Custom swatch', () => {
    render(<Controlled />)
    expect(screen.queryByRole('radio', { name: /custom/i })).toBeNull()
    expect(radios()).toHaveLength(10)
  })
  it('disabled disables every swatch and nothing fires', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} disabled />)
    for (const r of radios()) expect(r).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: 'Sage' }))
    expect(onChange).not.toHaveBeenCalled()
  })
  it('shows helper and error lines', () => {
    render(<Controlled helper="Pick a colour" error="Choose a colour" />)
    expect(screen.getByText('Pick a colour')).toBeInTheDocument()
    expect(screen.getByText('Choose a colour')).toBeInTheDocument()
  })
  it('draws the preview slot after the swatches, outside the radiogroup', () => {
    render(<Controlled preview={<span data-testid="preview">Fish</span>} />)
    const preview = screen.getByTestId('preview')
    expect(preview).toBeInTheDocument()
    expect(screen.getByRole('radiogroup').contains(preview)).toBe(false)
  })
})
