import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'
import { RadioCards } from './RadioCards'
import { Segmented } from './Segmented'
import { Switch } from './Switch'

describe('Checkbox', () => {
  function Box(props: { onChange?: (v: boolean) => void; initial?: boolean; disabled?: boolean; indeterminate?: boolean }) {
    const [checked, setChecked] = useState(props.initial ?? false)
    return <Checkbox label="Pin this Meal" description="Keeps it through regeneration" checked={checked} indeterminate={props.indeterminate} disabled={props.disabled} onChange={(v) => { setChecked(v); props.onChange?.(v) }} />
  }
  it('is a labelled checkbox with a description; click and Space toggle', async () => {
    const onChange = vi.fn()
    render(<Box onChange={onChange} />)
    const box = screen.getByRole('checkbox', { name: 'Pin this Meal' })
    expect(box).toHaveAccessibleDescription('Keeps it through regeneration')
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(box).toBeChecked()
    expect(onChange).toHaveBeenLastCalledWith(true)
    box.focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })
  it('clicking the label text toggles too', async () => {
    render(<Box />)
    await userEvent.click(screen.getByText('Pin this Meal'))
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
  it('draws its own box and keeps the native input visually replaced', () => {
    const { container } = render(<Box />)
    expect(container.querySelector('.checkbox__box')).not.toBeNull()
  })
  it('supports the mixed state and disabled', () => {
    const { rerender } = render(<Checkbox label="All" checked={false} indeterminate onChange={() => {}} />)
    expect(screen.getByRole('checkbox')).toBePartiallyChecked()
    rerender(<Checkbox label="All" checked disabled onChange={() => {}} />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})

describe('Switch', () => {
  function Sw(props: { onChange?: (v: boolean) => void }) {
    const [on, setOn] = useState(false)
    return <Switch label="Notify me" checked={on} onChange={(v) => { setOn(v); props.onChange?.(v) }} />
  }
  it('is a role=switch button toggled by click, Space and Enter', async () => {
    const onChange = vi.fn()
    render(<Sw onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'Notify me' })
    expect(sw.tagName).toBe('BUTTON')
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    sw.focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith(false)
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(true)
  })
  it('does nothing when disabled', async () => {
    const onChange = vi.fn()
    render(<Switch label="X" checked={false} disabled onChange={onChange} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

type Theme = 'light' | 'dark' | 'system'
const themes = [
  { value: 'light' as Theme, label: 'Light' },
  { value: 'dark' as Theme, label: 'Dark' },
  { value: 'system' as Theme, label: 'System' },
]

describe('Segmented', () => {
  function Seg(props: { initial?: Theme; onChange?: (v: Theme) => void; options?: typeof themes | Array<(typeof themes)[number] & { disabled?: boolean }> }) {
    const [v, setV] = useState<Theme>(props.initial ?? 'light')
    return <Segmented label="Theme" options={props.options ?? themes} value={v} onChange={(x) => { setV(x); props.onChange?.(x) }} />
  }
  it('is a radiogroup of radios, the selected one aria-checked', () => {
    render(<Seg initial="dark" />)
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false')
  })
  it('click selects', async () => {
    const onChange = vi.fn()
    render(<Seg onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(onChange).toHaveBeenCalledWith('system')
  })
  it('roving tabindex: Tab lands on the selected radio only; arrows move and select, wrapping', async () => {
    const onChange = vi.fn()
    render(<><button>before</button><Seg initial="dark" onChange={onChange} /></>)
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('tabindex', '-1')
    screen.getByText('before').focus()
    await userEvent.tab()
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('system')
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('light')
    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('system')
  })
  it('Home and End jump to the ends; disabled options are skipped', async () => {
    const onChange = vi.fn()
    render(<Seg initial="light" onChange={onChange} options={[themes[0]!, { ...themes[1]!, disabled: true }, themes[2]!]} />)
    screen.getByRole('radio', { name: 'Light' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('system')
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith('light')
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith('system')
  })
})

describe('RadioCards', () => {
  const units = [
    { value: 'metric' as const, title: 'Metric', description: 'grams, millilitres' },
    { value: 'imperial' as const, title: 'Imperial', description: 'ounces, cups' },
  ]
  it('shows title and description per card, same radio semantics as Segmented', async () => {
    const onChange = vi.fn()
    render(<RadioCards label="Units" options={units} value="metric" onChange={onChange} />)
    const group = screen.getByRole('radiogroup', { name: 'Units' })
    expect(group).toHaveTextContent('grams, millilitres')
    expect(screen.getByRole('radio', { name: /Metric/ })).toHaveAttribute('aria-checked', 'true')
    screen.getByRole('radio', { name: /Metric/ }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith('imperial')
    await userEvent.click(screen.getByRole('radio', { name: /Imperial/ }))
    expect(onChange).toHaveBeenLastCalledWith('imperial')
  })
})
