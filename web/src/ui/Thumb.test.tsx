// PE: ui/Thumb is the one thumb for an Ingredient's or a Product's Picture. With a Picture: the image (decorative). Without one, or when it
// fails to load: an empty reserved slot of the same box, so list names stay aligned. (Members use Avatar: photo -> emoji -> initials.)
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Thumb } from './index'

const url = (c: string) => `/api/images/${c.repeat(32)}`
const root = (c: HTMLElement) => c.querySelector<HTMLElement>('.thumb')!

describe('Thumb', () => {
  it('draws the image, decorative (alt=""), at the default size 40', () => {
    const { container } = render(<Thumb imageUrl={url('a')} name="Passata" />)
    expect(root(container)).toHaveAttribute('data-size', '40')
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', url('a'))
    expect(img).toHaveAttribute('alt', '')
    expect(root(container)).not.toHaveAttribute('aria-hidden')
  })

  it.each([40, 48, 72, 'hero'] as const)('size %s is the data-size of the box', (size) => {
    const { container } = render(<Thumb imageUrl={url('a')} size={size} name="Passata" />)
    expect(root(container)).toHaveAttribute('data-size', String(size))
  })

  it('a label becomes the alt text', () => {
    const { container } = render(<Thumb imageUrl={url('a')} label="Mutti passata" name="Passata" />)
    expect(container.querySelector('img')).toHaveAttribute('alt', 'Mutti passata')
  })

  // DS-A (system.md §7): never an empty box. The no-Picture case is now the monogram (Thumb.ds.test.tsx); the box keeps its size.
  it.each([undefined, ''])('without a Picture (%j) the box keeps its data-size and stays hidden from assistive tech', (imageUrl) => {
    const { container } = render(<Thumb imageUrl={imageUrl} size={48} name="Cumin seeds" />)
    const slot = root(container)
    expect(slot).toHaveAttribute('data-size', '48')
    expect(slot).toHaveAttribute('aria-hidden', 'true')
    expect(slot.querySelector('img')).toBeNull()
  })

  it('a picture that fails to load becomes the slot, same size', () => {
    const { container } = render(<Thumb imageUrl={url('gone')} size={72} name="Feta" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(root(container)).toHaveAttribute('data-size', '72')
    expect(root(container)).toHaveAttribute('aria-hidden', 'true')
  })

  it('a different address gets a new try after a failure; the failed one does not', () => {
    const { container, rerender } = render(<Thumb imageUrl={url('one')} name="Egg" />)
    fireEvent.error(container.querySelector('img')!)
    rerender(<Thumb imageUrl={url('one')} name="Egg" />)
    expect(container.querySelector('img')).toBeNull()
    rerender(<Thumb imageUrl={url('two')} name="Egg" />)
    expect(container.querySelector('img')).toHaveAttribute('src', url('two'))
  })
})
