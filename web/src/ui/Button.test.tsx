import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button, PRIMARY_SCOPE_ATTR } from './Button'

afterEach(() => vi.restoreAllMocks())

describe('Button variants and sizes (plan 4.2)', () => {
  it.each(['primary', 'secondary', 'accent-secondary', 'tertiary', 'danger', 'danger-tertiary'] as const)('exposes variant %s', (variant) => {
    render(<Button variant={variant}>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('data-variant', variant)
  })

  it('defaults to a primary md button of type "button"', () => {
    render(<Button>Go</Button>)
    const b = screen.getByRole('button', { name: 'Go' })
    expect(b).toHaveAttribute('data-variant', 'primary')
    expect(b).toHaveAttribute('data-size', 'md')
    expect(b).toHaveAttribute('type', 'button')
  })

  it.each(['sm', 'md', 'lg', 'xl'] as const)('exposes size %s', (size) => {
    render(<Button size={size}>Go</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-size', size)
  })

  it('compat: the deprecated variants tonal and ghost render as secondary and tertiary', () => {
    render(<><Button variant="tonal">A</Button><Button variant="ghost">B</Button></>)
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('data-variant', 'tertiary')
  })
})

describe('Button states', () => {
  it('disabled does not fire onClick', async () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Go</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('loading is busy, disabled, keeps its label and shows a spinner instead of the icon', async () => {
    const onClick = vi.fn()
    const { container } = render(<Button loading icon="add" onClick={onClick}>Save</Button>)
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b).toHaveAttribute('aria-busy', 'true')
    expect(b).toBeDisabled()
    expect(container.querySelector('[data-spinner]')).not.toBeNull()
    expect(container.querySelector('svg')).toBeNull()
    await userEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('draws its icon through Icon (decorative svg) before the label', () => {
    const { container } = render(<Button icon="add">Add</Button>)
    const svg = container.querySelector('button > svg, button svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('forwards type="submit"', () => {
    render(<Button type="submit">Save</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})

describe('Button single-primary dev warning (plan 4.2 "max one per tile/sheet")', () => {
  const warned = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.some((c: unknown[]) => /more than one primary/i.test(String(c[0])))

  it('warns when two primaries share a scope', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<div {...{ [PRIMARY_SCOPE_ATTR]: '' }}><Button>One</Button><Button>Two</Button></div>)
    expect(warned(spy)).toBe(true)
  })

  it('does not warn for one primary per scope, nor for secondaries next to a primary', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <>
        <div {...{ [PRIMARY_SCOPE_ATTR]: '' }}><Button>One</Button><Button variant="secondary">Alt</Button><Button variant="tertiary">Cancel</Button></div>
        <div {...{ [PRIMARY_SCOPE_ATTR]: '' }}><Button>Two</Button></div>
      </>,
    )
    expect(warned(spy)).toBe(false)
  })

  it('warns once per scope, not once per render', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ui = <div {...{ [PRIMARY_SCOPE_ATTR]: '' }}><Button>One</Button><Button>Two</Button></div>
    const { rerender } = render(ui)
    rerender(ui)
    rerender(ui)
    expect(spy.mock.calls.filter((c: unknown[]) => /more than one primary/i.test(String(c[0])))).toHaveLength(1)
  })

  it('a deprecated tonal (secondary) button does not count as a primary', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<div {...{ [PRIMARY_SCOPE_ATTR]: '' }}><Button>One</Button><Button variant="tonal">Two</Button></div>)
    expect(warned(spy)).toBe(false)
  })
})
