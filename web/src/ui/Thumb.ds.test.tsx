// DS-A (docs/design/system.md §7): a missing Picture is never an empty box. Thumb takes the `name` it stands for and, without a
// Picture (or after a load error), draws a monogram: the first letter, uppercase, weight 800, accent-text on soft, same box.
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Thumb } from './index'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('Thumb.css')
const box = (c: HTMLElement) => c.querySelector<HTMLElement>('.thumb')!

describe('Thumb monogram', () => {
  it('requires the name it stands for (type error without it)', () => {
    // @ts-expect-error `name` is required: the monogram needs it
    const el = <Thumb imageUrl="" />
    expect(el).toBeTruthy()
  })

  it.each([
    ['Cucumber', 'C'],
    ['cumin seeds', 'C'],
    ['éclair dough', 'É'],
    ['  Dill', 'D'],
    ['24-month Parmigiano', 'P'],
  ])('without a Picture, "%s" draws the monogram "%s"', (name, letter) => {
    const { container } = render(<Thumb name={name} />)
    const el = box(container)
    expect(el).toHaveAttribute('data-monogram', 'true')
    expect(el.querySelector('.thumb__monogram')).toHaveTextContent(letter)
    expect(el.textContent).toBe(letter)
    expect(el).toHaveAttribute('aria-hidden', 'true') // the name is shown next to it
  })

  it('a Picture that fails to load falls back to the monogram, same data-size', () => {
    const { container } = render(<Thumb name="Gorgonzola" imageUrl="/api/images/aaaa" size={48} />)
    fireEvent.error(container.querySelector('img')!)
    expect(box(container)).toHaveAttribute('data-size', '48')
    expect(box(container).querySelector('.thumb__monogram')).toHaveTextContent('G')
  })

  it('with a Picture there is no monogram', () => {
    const { container } = render(<Thumb name="Brandy" imageUrl="/api/images/bbbb" />)
    expect(box(container).querySelector('.thumb__monogram')).toBeNull()
    expect(box(container)).not.toHaveAttribute('data-monogram')
  })

  it('a name with no letter or digit still draws a box, with no text (never "undefined")', () => {
    const { container } = render(<Thumb name="—" />)
    expect(box(container).textContent).toBe('')
  })

  it('the monogram is centred, weight 800, accent-text on soft; it scales with the box', () => {
    const d = declarations(css, ".thumb[data-monogram='true']")
    expect(d['display']).toBe('grid')
    expect(d['place-items']).toBe('center')
    expect(d['background']).toBe('var(--color-soft)')
    expect(d['color']).toBe('var(--color-accent-text)')
    expect(d['font-weight']).toBe('800')
    expect(declarations(css, ".thumb[data-size='72'][data-monogram='true']")['font-size']).toBe('var(--text-title-1-size)')
    expect(declarations(css, ".thumb[data-size='40'][data-monogram='true']")['font-size']).toBe('var(--text-title-3-size)')
  })
})
