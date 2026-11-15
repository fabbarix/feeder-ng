// SAFE-04: `focusFirstInvalid(root)` is the DOM helper. It finds [aria-invalid="true"] and [data-invalid-target] in DOM order, opens a
// closed Disclosure around the target (RX-02), scrolls it to the centre (clear of the app bar and any sticky bar) and focuses it.
// Signature: focusFirstInvalid(root: ParentNode | null | undefined): HTMLElement | null  (the element focused, or null).
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Disclosure } from '../Disclosure'
import { focusFirstInvalid } from './focusFirstInvalid'
import { Segmented } from './Segmented'
import { TextField } from './TextField'

const noop = () => {}
let scrollSpy: ReturnType<typeof vi.fn>
beforeEach(() => {
  scrollSpy = vi.fn()
  Element.prototype.scrollIntoView = scrollSpy as unknown as typeof Element.prototype.scrollIntoView
})
afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

const run = (root: ParentNode) => {
  let out: HTMLElement | null = null
  act(() => {
    out = focusFirstInvalid(root)
  })
  return out as HTMLElement | null
}

describe('focusFirstInvalid', () => {
  it('focuses the first invalid control in DOM order, not the first one that was reported', () => {
    const { container } = render(
      <form>
        <TextField label="Name" value="" onChange={noop} />
        <TextField label="Email" value="" onChange={noop} error="Enter an email." />
        <TextField label="Phone" value="" onChange={noop} error="Enter a phone." />
      </form>,
    )
    const hit = run(container)
    expect(hit).toBe(screen.getByLabelText('Email'))
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('returns null and moves nothing when there is no invalid control', () => {
    const { container } = render(<TextField label="Name" value="" onChange={noop} />)
    screen.getByLabelText('Name').focus()
    expect(run(container)).toBeNull()
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('accepts a null root', () => {
    expect(focusFirstInvalid(null)).toBeNull()
  })

  it('scrolls the control to the centre of the view, then focuses it without a second scroll', () => {
    const { container } = render(<TextField label="Name" value="" onChange={noop} error="Enter a name." />)
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
    run(container)
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }))
    expect(focusSpy).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
    focusSpy.mockRestore()
  })

  it('a non-focusable invalid group (a Segmented) focuses its tab stop', () => {
    const { container } = render(
      <Segmented label="Kind" value="a" onChange={noop} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} error="Choose a kind." />,
    )
    const hit = run(container)
    expect(hit).toBe(screen.getByRole('radio', { name: 'A' }))
    expect(hit).toHaveFocus()
  })

  it('a [data-invalid-target] section focuses its [data-focus-target] (the "Add ingredient" button), else its first focusable', () => {
    const { container } = render(
      <div>
        <section data-invalid-target>
          <h2>Ingredients</h2>
          <button type="button">Other</button>
          <button type="button" data-focus-target>
            Add ingredient
          </button>
        </section>
        <section data-invalid-target>
          <button type="button">Second</button>
        </section>
      </div>,
    )
    expect(run(container)).toBe(screen.getByRole('button', { name: 'Add ingredient' }))
    ;(screen.getByRole('button', { name: 'Add ingredient' }).closest('section') as HTMLElement).removeAttribute('data-invalid-target')
    expect(run(container)).toBe(screen.getByRole('button', { name: 'Second' }))
  })

  it('skips a disabled control and a hidden one', () => {
    const { container } = render(
      <div>
        <input aria-label="Off" aria-invalid="true" disabled />
        <div hidden>
          <input aria-label="Hidden" aria-invalid="true" />
        </div>
        <input aria-label="Real" aria-invalid="true" />
      </div>,
    )
    expect(run(container)).toBe(screen.getByLabelText('Real'))
  })

  it('opens a closed Disclosure around the invalid field first, so the focus lands (RX-02: Planning opens itself on an error)', () => {
    const { container } = render(
      <form>
        <TextField label="Name" value="x" onChange={noop} />
        <Disclosure id="planning" title="Planning" summary="Main · quick">
          <TextField label="Cool-down" value="" onChange={noop} error="Enter days." />
        </Disclosure>
      </form>,
    )
    expect(screen.getByRole('button', { name: /Planning/ })).toHaveAttribute('aria-expanded', 'false')
    const hit = run(container)
    expect(screen.getByRole('button', { name: /Planning/ })).toHaveAttribute('aria-expanded', 'true')
    expect(hit).toBe(screen.getByLabelText('Cool-down'))
    expect(screen.getByLabelText('Cool-down')).toHaveFocus()
  })
})
