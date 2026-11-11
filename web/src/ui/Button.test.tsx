import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button, PRIMARY_SCOPE_ATTR } from './Button'
import { declarations, readStylesCss, readUiCss, ruleBlocks } from './test-utils'

afterEach(() => vi.restoreAllMocks())

describe('Button ref', () => {
  it('forwards an object ref and a callback ref to the button element', () => {
    const obj = { current: null as HTMLButtonElement | null }
    const cb = vi.fn()
    const { rerender } = render(<Button ref={obj}>One</Button>)
    expect(obj.current).toBe(screen.getByRole('button', { name: 'One' }))
    rerender(<Button ref={cb}>One</Button>)
    expect(cb).toHaveBeenCalledWith(screen.getByRole('button', { name: 'One' }))
  })
})

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

describe('Button styling contract (review fixes)', () => {
  const css = readUiCss('Button.css')
  it('danger text is the fixed on-solid token, not a surface colour that goes dark', () => {
    expect(declarations(css, ".button[data-variant='danger']")).toMatchObject({
      background: 'var(--status-danger-solid)',
      color: 'var(--status-danger-on-solid)',
    })
  })
  it('--status-danger-on-solid is white in every palette block that sets the solid', () => {
    const blocks = ruleBlocks(readStylesCss()).filter((b) => /--status-danger-solid\s*:/.test(b.body))
    expect(blocks.length).toBeGreaterThanOrEqual(2) // light and dark
    for (const b of blocks) expect(b.body, b.selectors.join(',')).toMatch(/--status-danger-on-solid\s*:\s*(#fff|#ffffff)\s*;/i)
  })
  it('font weights are tokens, no numeric literal', () => {
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/font-weight\s*:\s*([^;]+);/g)) expect(m[1]).toMatch(/^var\(--/)
  })
})
