import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'
import { declarations, readUiCss } from '../test-utils'

function Num(props: Partial<React.ComponentProps<typeof NumberField>> & { initial?: number | null; onValue?: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(props.initial === undefined ? 4 : props.initial)
  const { initial: _i, onValue, ...rest } = props
  return <NumberField label="Portions" {...rest} value={value} onChange={(v) => { setValue(v); onValue?.(v) }} />
}
const input = () => screen.getByRole('spinbutton', { name: 'Portions' })

describe('NumberField', () => {
  it('is a text input (inputmode decimal), not a native number input', () => {
    render(<Num />)
    expect(input()).toHaveAttribute('type', 'text')
    expect(input()).toHaveAttribute('inputmode', 'decimal')
    expect(input()).toHaveValue('4')
  })

  it('announces the unit: it is part of the accessible description', () => {
    render(<Num unit="days" />)
    expect(input()).toHaveAccessibleDescription('days')
  })

  it('announces the unit before the helper text', () => {
    render(<Num unit="min" helper="Time to reheat" />)
    expect(input()).toHaveAccessibleDescription('min Time to reheat')
  })

  it('has no description when there is no unit, helper or error', () => {
    render(<Num />)
    expect(input()).not.toHaveAttribute('aria-describedby')
  })

  it('shows the unit and exposes bounds', () => {
    render(<Num unit="g" min={0} max={500} />)
    expect(screen.getByText('g')).toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-valuemin', '0')
    expect(input()).toHaveAttribute('aria-valuemax', '500')
    expect(input()).toHaveAttribute('aria-valuenow', '4')
  })

  it('ArrowUp/ArrowDown step by step and commit', async () => {
    const onValue = vi.fn()
    render(<Num step={0.5} onValue={onValue} />)
    input().focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onValue).toHaveBeenLastCalledWith(4.5)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(onValue).toHaveBeenLastCalledWith(3.5)
  })

  it('does not fire per keystroke; commits typed text on blur, accepting a decimal comma', async () => {
    const onValue = vi.fn()
    render(<Num onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '2,5')
    expect(onValue).not.toHaveBeenCalled()
    await userEvent.tab()
    expect(onValue).toHaveBeenCalledTimes(1)
    expect(onValue).toHaveBeenLastCalledWith(2.5)
  })

  it('Enter commits', async () => {
    const onValue = vi.fn()
    render(<Num onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '8{Enter}')
    expect(onValue).toHaveBeenLastCalledWith(8)
  })

  it('clamps to max and min on commit and shows the clamped text', async () => {
    const onValue = vi.fn()
    render(<Num min={1} max={100} onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '150')
    await userEvent.tab()
    expect(onValue).toHaveBeenLastCalledWith(100)
    expect(input()).toHaveValue('100')
    await userEvent.clear(input())
    await userEvent.type(input(), '0')
    await userEvent.tab()
    expect(onValue).toHaveBeenLastCalledWith(1)
  })

  it('reverts invalid text to the last value without calling onChange', async () => {
    const onValue = vi.fn()
    render(<Num onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.type(input(), 'abc')
    await userEvent.tab()
    expect(onValue).not.toHaveBeenCalled()
    expect(input()).toHaveValue('4')
  })

  it('emptying the field commits null', async () => {
    const onValue = vi.fn()
    render(<Num onValue={onValue} />)
    await userEvent.clear(input())
    await userEvent.tab()
    expect(onValue).toHaveBeenLastCalledWith(null)
  })

  it('has labelled ± buttons that respect the bounds, unless hidden', async () => {
    const onValue = vi.fn()
    const { unmount } = render(<Num max={4} onValue={onValue} />)
    expect(screen.getByRole('button', { name: 'Increase Portions' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Portions' }))
    expect(onValue).toHaveBeenLastCalledWith(3)
    unmount()
    render(<Num hideStepper />)
    expect(screen.queryByRole('button', { name: 'Increase Portions' })).toBeNull()
  })

  it('links helper and error text', () => {
    render(<Num helper="Per serving" error="Too many" />)
    expect(input()).toHaveAccessibleDescription(/Per serving/)
    expect(input()).toHaveAccessibleDescription(/Too many/)
    expect(input()).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('WP3b #19: Enter commits before the form submits', () => {
  function Form({ onSubmitValues, max }: { onSubmitValues: (state: number | null, posted: FormDataEntryValue | null) => void; max?: number }) {
    const [value, setValue] = useState<number | null>(4)
    const latest = { current: value }
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmitValues(latest.current, new FormData(e.currentTarget).get('qty'))
        }}
      >
        <NumberField label="Portions" name="qty" max={max} value={value} onChange={(v) => { latest.current = v; setValue(v) }} />
        <button type="submit">Save</button>
      </form>
    )
  }

  it('the submit handler sees the typed value (decimal comma) in state and in FormData', async () => {
    const seen = vi.fn()
    render(<Form onSubmitValues={seen} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '2,5{Enter}')
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith(2.5, '2.5')
  })

  it('the submit handler sees the clamped value, not the raw text', async () => {
    const seen = vi.fn()
    render(<Form max={100} onSubmitValues={seen} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '150{Enter}')
    expect(seen).toHaveBeenCalledWith(100, '100')
  })
})

describe('WP3b #20: NumberField colour contrast (plan 3.1: text pairs >= 4.5)', () => {
  const css = readUiCss('fields/Field.css')
  it('a disabled field is not dimmed with opacity (it would drop the unit suffix, not a disabled element, below AA)', () => {
    expect(declarations(css, '.ui-field__control:has(:disabled)')).not.toHaveProperty('opacity')
  })
  it('a disabled field keeps the muted / surface-2 pair (5.9 light, 7.5 dark) for the suffix', () => {
    expect(declarations(css, '.ui-field__control:has(:disabled) .ui-field__suffix')).toMatchObject({ color: 'var(--color-muted)' })
    expect(declarations(css, '.ui-field__control')).toMatchObject({ background: 'var(--color-surface-2)' })
  })
})
