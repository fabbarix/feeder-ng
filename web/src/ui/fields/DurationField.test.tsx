// RX-08 (B9-16): `ui/fields/DurationField`, the Duration of a Step and the Lead time of an Advance Step, in min, h or d.
// A group labelled by its visible label, holding a number input ("Lead time", decimals allowed, xs) and a compact unit Select
// ("Lead time unit", 6 rem). The value is WHOLE MINUTES: on load `splitMinutes` picks the largest unit that divides evenly (1440 -> 1 d,
// 720 -> 12 h, 90 -> 90 min); changing the unit converts the shown number and does NOT change the minutes (no onChange).
// API: <DurationField label value: number | null onChange(minutes: number | null) units?: DurationUnit[] (default ['min','h']) helper? error? disabled? required? />
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { DurationField } from './DurationField'

function Harness({ initial, units, label = 'Lead time', onMinutes }: { initial: number | null; units?: ('min' | 'h' | 'd')[]; label?: string; onMinutes?: (m: number | null) => void }) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <DurationField
      label={label}
      value={value}
      units={units}
      onChange={(m) => {
        setValue(m)
        onMinutes?.(m)
      }}
    />
  )
}
const number = (label = 'Lead time') => screen.getByRole('spinbutton', { name: label }) as HTMLInputElement
const unit = (label = 'Lead time') => screen.getByRole('combobox', { name: new RegExp(`${label} unit`) })
const pickUnit = async (name: string, label = 'Lead time') => {
  await userEvent.click(unit(label))
  await userEvent.click(screen.getByRole('option', { name }))
}

describe('DurationField shows the largest even unit', () => {
  it.each([
    [1440, '1', 'd'],
    [720, '12', 'h'],
    [90, '90', 'min'],
    [60, '1', 'h'],
    [2880, '2', 'd'],
  ] as const)('%d min reads %s %s', (minutes, shown, u) => {
    render(<Harness initial={minutes} units={['min', 'h', 'd']} />)
    expect(number().value).toBe(shown)
    expect(unit()).toHaveTextContent(u)
  })

  it('Duration offers min and h only, so a day is 24 h', () => {
    render(<Harness initial={1440} label="Duration" />)
    expect(number('Duration').value).toBe('24')
    expect(unit('Duration')).toHaveTextContent('h')
  })

  it('an empty value is an empty input', () => {
    render(<Harness initial={null} />)
    expect(number().value).toBe('')
  })
})

describe('DurationField anatomy', () => {
  it('is a group named by its visible label, with the number named like the group and the unit "<label> unit"', () => {
    render(<Harness initial={720} />)
    expect(screen.getByRole('group', { name: 'Lead time' })).toBeInTheDocument()
    expect(number()).toBeInTheDocument()
    expect(unit()).toBeInTheDocument()
    expect(screen.getByText('Lead time')).toBeVisible()
  })

  it('offers min and h for Duration, and min, h and d for Lead time, as options', async () => {
    const { unmount } = render(<Harness initial={720} label="Duration" />)
    await userEvent.click(unit('Duration'))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['min', 'h'])
    unmount()
    render(<Harness initial={720} units={['min', 'h', 'd']} />)
    await userEvent.click(unit())
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['min', 'h', 'd'])
  })

  it('error: marks the group and the number invalid, and says why', () => {
    render(<DurationField label="Lead time" value={0} onChange={() => {}} error="Enter a lead time." />)
    expect(number()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('group', { name: 'Lead time' })).toHaveAttribute('aria-invalid', 'true')
    expect(number()).toHaveAccessibleDescription(/Enter a lead time\./)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('helper: describes the number', () => {
    render(<DurationField label="Lead time" value={0} onChange={() => {}} helper="Start this far ahead." />)
    expect(number()).toHaveAccessibleDescription(/Start this far ahead\./)
  })

  it('disabled: both controls are disabled', () => {
    render(<DurationField label="Lead time" value={60} disabled onChange={() => {}} />)
    expect(number()).toBeDisabled()
    expect(unit()).toBeDisabled()
  })
})

describe('DurationField editing', () => {
  it('typing a number commits whole minutes on blur: 12 h is 720', async () => {
    const onMinutes = vi.fn()
    render(<Harness initial={60} units={['min', 'h', 'd']} onMinutes={onMinutes} />)
    await userEvent.clear(number())
    await userEvent.type(number(), '12')
    await userEvent.tab()
    expect(onMinutes).toHaveBeenLastCalledWith(720)
  })

  it('accepts a decimal, with a point or a comma: 1.5 h is 90 min', async () => {
    const onMinutes = vi.fn()
    render(<Harness initial={60} units={['min', 'h']} onMinutes={onMinutes} />)
    await userEvent.clear(number())
    await userEvent.type(number(), '1,5')
    await userEvent.keyboard('{Enter}')
    expect(onMinutes).toHaveBeenLastCalledWith(90)
  })

  it('does not call onChange while typing, only on commit', async () => {
    const onMinutes = vi.fn()
    render(<Harness initial={60} onMinutes={onMinutes} />)
    await userEvent.clear(number())
    await userEvent.type(number(), '3')
    expect(onMinutes).not.toHaveBeenCalled()
  })

  it('changing the unit converts the shown number and keeps the minutes: 12 h becomes 720 min, with no onChange', async () => {
    const onMinutes = vi.fn()
    render(<Harness initial={720} onMinutes={onMinutes} />)
    expect(number().value).toBe('12')
    await pickUnit('min')
    expect(number().value).toBe('720')
    expect(unit()).toHaveTextContent('min')
    expect(onMinutes).not.toHaveBeenCalled()
  })

  it('and back: 720 min in h is 12', async () => {
    render(<Harness initial={720} />)
    await pickUnit('min')
    await pickUnit('h')
    expect(number().value).toBe('12')
  })

  it('a typed value uses the unit on screen: after switching to min, 30 is 30 minutes', async () => {
    const onMinutes = vi.fn()
    render(<Harness initial={720} onMinutes={onMinutes} />)
    await pickUnit('min')
    await userEvent.clear(number())
    await userEvent.type(number(), '30')
    await userEvent.tab()
    expect(onMinutes).toHaveBeenLastCalledWith(30)
  })

  it('shows at most 2 decimals after a unit change (100 min in h reads 1.67) and keeps 100 minutes', async () => {
    const onMinutes = vi.fn()
    render(<Harness initial={100} units={['min', 'h']} onMinutes={onMinutes} />)
    expect(number().value).toBe('100')
    await pickUnit('h')
    expect(number().value).toBe('1.67')
    expect(onMinutes).not.toHaveBeenCalled()
  })

  it('arrows step the number by 1 in the shown unit', async () => {
    const onMinutes = vi.fn()
    render(<Harness initial={720} onMinutes={onMinutes} />)
    number().focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onMinutes).toHaveBeenLastCalledWith(780)
  })

  it('clearing the number commits null; invalid text reverts', async () => {
    const onMinutes = vi.fn()
    render(<Harness initial={60} onMinutes={onMinutes} />)
    await userEvent.clear(number())
    await userEvent.tab()
    expect(onMinutes).toHaveBeenLastCalledWith(null)
    onMinutes.mockClear()
    await userEvent.type(number(), 'abc')
    await userEvent.tab()
    expect(onMinutes).not.toHaveBeenCalled()
    expect(number().value).toBe('')
  })

  it('negative numbers are not accepted: the value is never below 0', async () => {
    const onMinutes = vi.fn()
    render(<Harness initial={60} onMinutes={onMinutes} />)
    await userEvent.clear(number())
    await userEvent.type(number(), '-5')
    await userEvent.tab()
    expect(onMinutes).toHaveBeenLastCalledWith(0)
  })

  it('a new value from outside (the draft loaded) is split again', () => {
    const { rerender } = render(<DurationField label="Lead time" value={90} units={['min', 'h', 'd']} onChange={() => {}} />)
    expect(number().value).toBe('90')
    rerender(<DurationField label="Lead time" value={1440} units={['min', 'h', 'd']} onChange={() => {}} />)
    expect(number().value).toBe('1')
    expect(unit()).toHaveTextContent('d')
  })
})

describe('DurationField.css', () => {
  const css = readUiCss('fields/DurationField.css')
  it('the number is an xs field and the unit select is 6 rem, side by side on one line', () => {
    expect(declarations(css, '.duration-field__controls')['display']).toBe('flex')
    expect(declarations(css, '.duration-field__controls')['gap']).toBe('var(--space-2)')
    expect(declarations(css, '.duration-field__unit')['inline-size']).toBe('6rem')
    expect(declarations(css, '.duration-field__unit')['flex']).toBe('none')
    expect(declarations(css, '.duration-field__number')['max-inline-size']).toBe('var(--field-size-xs)')
  })
})
