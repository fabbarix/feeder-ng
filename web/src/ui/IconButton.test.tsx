import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'

afterEach(() => vi.restoreAllMocks())

describe('IconButton', () => {
  it('is a button named by its label, with a decorative icon', () => {
    const { container } = render(<IconButton icon="delete" label="Delete price" />)
    expect(screen.getByRole('button', { name: 'Delete price' })).toHaveAttribute('type', 'button')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('requires a label at the type level', () => {
    // @ts-expect-error label is required
    const bad = () => <IconButton icon="delete" />
    expect(bad).toBeTypeOf('function')
  })

  it.each(['', '   '])('throws for the blank label %j', (label) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<IconButton icon="delete" label={label} />)).toThrow(/label/i)
  })

  it('fires onClick, but not when disabled', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<IconButton icon="add" label="Add" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onClick).toHaveBeenCalledOnce()
    rerender(<IconButton icon="add" label="Add" onClick={onClick} disabled />)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('exposes md and compact sizes (md by default)', () => {
    const { rerender } = render(<IconButton icon="add" label="Add" />)
    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'md')
    rerender(<IconButton icon="add" label="Add" size="compact" />)
    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'compact')
  })

  it('is a toggle when pressed is given: aria-pressed, and the icon is drawn in fill weight while on', () => {
    const svgOf = (pressed: boolean) => {
      const { container, unmount } = render(<IconButton icon="pin" label="Pin" pressed={pressed} />)
      const out = { pressed: screen.getByRole('button').getAttribute('aria-pressed'), html: container.querySelector('svg')?.innerHTML }
      unmount()
      return out
    }
    const off = svgOf(false)
    const on = svgOf(true)
    expect(off.pressed).toBe('false')
    expect(on.pressed).toBe('true')
    expect(on.html).not.toBe(off.html)
  })

  it('has no aria-pressed when it is not a toggle', () => {
    render(<IconButton icon="add" label="Add" />)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed')
  })
})
