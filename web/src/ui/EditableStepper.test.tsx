// B9-48 (user decision "type or step"): EditableStepper and StepperField editable. The value is our own text input (role spinbutton,
// no native number spinner) beside − and +: type any amount, or step it; empty is null, drawn as the placeholder.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EditableStepper } from './EditableStepper'
import { StepperField } from './fields/StepperField'

function Harness({ initial = null as number | null, decimal = false, onChange = vi.fn() }) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <EditableStepper
      label="Shelf Life"
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
      min={1}
      max={3650}
      unit="days"
      placeholder="Not set"
      decimal={decimal}
    />
  )
}
const input = () => screen.getByRole('spinbutton', { name: 'Shelf Life' }) as HTMLInputElement
const up = () => screen.getByRole('button', { name: 'Increase Shelf Life' })
const down = () => screen.getByRole('button', { name: 'Decrease Shelf Life' })

describe('EditableStepper', () => {
  it('is a group with a text input spinbutton: no input[type=number], numeric keyboard, the placeholder while empty', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Shelf Life' })).toBeInTheDocument()
    expect(input()).toHaveAttribute('type', 'text')
    expect(input()).toHaveAttribute('inputmode', 'numeric')
    expect(input()).toHaveAttribute('placeholder', 'Not set')
    expect(input()).toHaveAttribute('aria-valuetext', 'Not set')
    expect(input()).not.toHaveAttribute('aria-valuenow')
    expect(document.querySelector('input[type=number]')).toBeNull()
    expect(down()).toBeDisabled()
  })
  it('typing reports every number at once, unclamped (the form checks it); only digits go in', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.type(input(), '3x65')
    expect(input()).toHaveValue('365')
    expect(onChange).toHaveBeenLastCalledWith(365)
    await userEvent.clear(input())
    expect(onChange).toHaveBeenLastCalledWith(null)
    await userEvent.type(input(), '9999')
    expect(onChange).toHaveBeenLastCalledWith(9999)
    expect(input()).toHaveAttribute('aria-valuenow', '9999')
  })
  it('+ from empty gives min, then steps; − from min empties it; arrows step too', async () => {
    render(<Harness />)
    await userEvent.click(up())
    expect(input()).toHaveValue('1')
    await userEvent.click(up())
    expect(input()).toHaveValue('2')
    input().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(input()).toHaveValue('')
  })
  it('stops at max going up', () => {
    render(<Harness initial={3650} />)
    expect(up()).toBeDisabled()
  })
  it('decimal: one decimal mark, a comma read as a point, and "0," kept while typing "0,5"', async () => {
    const onChange = vi.fn()
    render(<Harness decimal onChange={onChange} />)
    expect(input()).toHaveAttribute('inputmode', 'decimal')
    await userEvent.type(input(), '0,,5')
    expect(input()).toHaveValue('0,5')
    expect(onChange).toHaveBeenLastCalledWith(0.5)
  })
})

describe('StepperField editable', () => {
  it('renders the EditableStepper with the visible label and helper describing it; the step-only field is unchanged', () => {
    render(<StepperField editable label="Shelf Life" helper="Leave blank if it keeps." value={null} onChange={() => {}} min={1} placeholder="Not set" />)
    expect(screen.getByText('Shelf Life')).toBeVisible()
    expect(screen.getByRole('group', { name: 'Shelf Life' })).toHaveAccessibleDescription('Leave blank if it keeps.')
    expect(input().tagName).toBe('INPUT')
  })
})
