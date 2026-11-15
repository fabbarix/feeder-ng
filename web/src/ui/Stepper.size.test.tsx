// PC-03 / PC-15 (`Stepper lg`) and A11Y-09 / A11Y-02 for the bare Stepper.
// lg is the Reheat tile's stepper: 56 px buttons around a big tabular value. It needs to say its own button names ("Remove 30 seconds")
// and to show a formatted value ("4:00"), so the Stepper gains `decreaseLabel`, `increaseLabel` and `format`. The value stays a
// spinbutton (arrows, Home, End) with aria-valuetext = the formatted text; the Cook screen does not get role="timer" from the Stepper.
// A bare Stepper's - and + rings never touch the focusable value (the + ring touched it on Recipe detail's Batches stepper).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'
import { declarations, readUiCss } from './test-utils'

describe('Stepper size="lg"', () => {
  it('is data-size lg with the two md IconButtons (the CSS sizes them to 56 px)', () => {
    render(<Stepper label="Reheat time" value={240} step={30} size="lg" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Reheat time' })).toHaveAttribute('data-size', 'lg')
    expect(screen.getByRole('button', { name: 'Decrease Reheat time' })).toHaveAttribute('data-size', 'md')
  })

  it('takes its own button names', () => {
    render(<Stepper label="Reheat time" value={240} step={30} size="lg" decreaseLabel="Remove 30 seconds" increaseLabel="Add 30 seconds" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Remove 30 seconds' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add 30 seconds' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Decrease Reheat time' })).toBeNull()
  })

  it('shows format(value) and exposes it as aria-valuetext, while aria-valuenow stays the number', () => {
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    render(<Stepper label="Reheat time" value={240} step={30} size="lg" format={fmt} onChange={() => {}} />)
    const spin = screen.getByRole('spinbutton', { name: 'Reheat time' })
    expect(spin).toHaveTextContent('4:00')
    expect(spin).toHaveAttribute('aria-valuetext', '4:00')
    expect(spin).toHaveAttribute('aria-valuenow', '240')
  })

  it('without format the value is the plain number and there is no aria-valuetext', () => {
    render(<Stepper label="portions" value={4} onChange={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: 'portions' })).not.toHaveAttribute('aria-valuetext')
  })

  it('steps by `step`, and the buttons stop at min and max', async () => {
    const onChange = vi.fn()
    render(<Stepper label="Reheat time" value={30} min={30} max={600} step={30} size="lg" onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Decrease Reheat time' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Reheat time' }))
    expect(onChange).toHaveBeenCalledWith(60)
  })

  it('invalid marks the value aria-invalid (StepperField passes it with an error)', () => {
    render(<Stepper label="portions" value={4} invalid onChange={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: 'portions' })).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Stepper.css', () => {
  const css = readUiCss('Stepper.css')

  it('lg is a three-column grid with 56 px buttons around the value', () => {
    expect(declarations(css, ".stepper[data-size='lg']")['display']).toBe('grid')
    expect(declarations(css, ".stepper[data-size='lg']")['grid-template-columns']).toBe('56px minmax(0, 1fr) 56px')
    expect(declarations(css, ".stepper[data-size='lg'] .icon-button")).toMatchObject({ 'inline-size': '56px', 'block-size': '56px' })
  })

  it('lg value is tabular and larger than the md one', () => {
    const d = declarations(css, ".stepper[data-size='lg'] .stepper__value")
    expect(d['font-variant-numeric']).toBe('tabular-nums')
    expect(d['font-size']).toBeTruthy()
    expect(d['font-size']).not.toBe('var(--text-title-2-size)')
  })

  it('the value rings inside itself on the soft fill (kept from B9-07)', () => {
    const d = declarations(css, '.stepper__value:focus-visible')
    expect(d['outline']).toBe('var(--focus-ring-inner-width) solid var(--focus-ring-color)')
    expect(d['outline-offset']).toBe('calc(-1 * var(--focus-ring-inner-width))')
    expect(d['background']).toBe('var(--color-soft)')
  })

  const TOKENS: Record<string, number> = { '--space-1': 4, '--space-2': 8, '--space-3': 12, '--icon-set-gap': 8, '0': 0 }
  const px = (v: string | undefined): number => {
    if (v === undefined) return 0
    const m = /^var\((--[a-z0-9-]+)\)$/.exec(v.trim())
    return m ? (TOKENS[m[1]!] ?? Number.NaN) : v.trim() === '0' ? 0 : Number.NaN
  }
  const clearance = (size: 'md' | 'sm' | 'xs') => {
    const group = size === 'md' ? declarations(css, '.stepper') : { ...declarations(css, '.stepper'), ...declarations(css, `.stepper[data-size='${size}']`) }
    const value = declarations(css, '.stepper__value')
    const margin = px(value['margin-inline'] ?? '0')
    return px(group['gap']) + margin
  }

  it.each(['md', 'sm', 'xs'] as const)('%s: the gap plus the value margin is at least 8 px, so the 5 px ring of - or + stops 3 px short of the value (A11Y-09)', (size) => {
    expect(clearance(size)).toBeGreaterThanOrEqual(8)
  })
})
