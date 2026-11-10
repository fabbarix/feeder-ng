import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecipeThumb } from './RecipeThumb'
import { declarations, readUiCss } from './test-utils'

describe('RecipeThumb (plan 4.15)', () => {
  it('shows the photo, decorative unless a label is given', () => {
    const { container, rerender } = render(<RecipeThumb name="Lasagne" photoUrl="/p/1.jpg" />)
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', '/p/1.jpg')
    expect(img).toHaveAttribute('alt', '')
    expect(container.querySelector('[data-generated]')).toBeNull()
    rerender(<RecipeThumb name="Lasagne" photoUrl="/p/1.jpg" label="Photo of Lasagne" />)
    expect(screen.getByRole('img', { name: 'Photo of Lasagne' })).toHaveAttribute('src', '/p/1.jpg')
  })

  it.each([40, 48, 72, 'hero'] as const)('exposes size %s (default 48)', (size) => {
    const { container } = render(<RecipeThumb name="Lasagne" size={size} />)
    expect(container.firstElementChild).toHaveAttribute('data-size', String(size))
  })
  it('defaults to 48', () => {
    const { container } = render(<RecipeThumb name="Lasagne" />)
    expect(container.firstElementChild).toHaveAttribute('data-size', '48')
  })

  describe('generated tile (no photo)', () => {
    it('shows the initial and the icon of the first Tag', () => {
      const { container } = render(<RecipeThumb name="chickpea curry" tags={['Pasta', 'fish']} />)
      const tile = container.querySelector('[data-generated]')!
      expect(tile).toHaveAttribute('data-tag-icon', 'pasta')
      expect(tile).toHaveTextContent('C')
      expect(tile.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    })

    it.each([
      ['fish', 'fish'],
      ['Chicken', 'chicken'],
      ['pizza', 'pizza'],
      ['soup', 'soup'],
      ['vegetarian', 'vegetarian'],
      ['dessert', 'other'],
    ])('Tag %s -> icon %s', (tag, icon) => {
      const { container } = render(<RecipeThumb name="x" tags={[tag]} />)
      expect(container.querySelector('[data-generated]')).toHaveAttribute('data-tag-icon', icon)
    })

    it('uses the default icon without tags, and "?" for a blank name', () => {
      const { container } = render(<RecipeThumb name="  " />)
      const tile = container.querySelector('[data-generated]')!
      expect(tile).toHaveAttribute('data-tag-icon', 'other')
      expect(tile).toHaveTextContent('?')
    })

    it('is decorative unless labelled', () => {
      const { container, rerender } = render(<RecipeThumb name="Lasagne" />)
      expect(container.querySelector('[data-generated]')).toHaveAttribute('aria-hidden', 'true')
      rerender(<RecipeThumb name="Lasagne" label="Lasagne" />)
      expect(screen.getByRole('img', { name: 'Lasagne' })).toHaveAttribute('data-generated')
    })
  })

  it('falls back to the generated tile when the photo fails to load', () => {
    const { container } = render(<RecipeThumb name="Lasagne" photoUrl="/missing.jpg" tags={['pasta']} />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-generated]')).toHaveAttribute('data-tag-icon', 'pasta')
  })

  it('tries the photo again when the URL changes', () => {
    const { container, rerender } = render(<RecipeThumb name="L" photoUrl="/a.jpg" />)
    fireEvent.error(container.querySelector('img')!)
    rerender(<RecipeThumb name="L" photoUrl="/b.jpg" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/b.jpg')
  })
})

describe('RecipeThumb styling (plan 4.15)', () => {
  const css = readUiCss('RecipeThumb.css')
  it('images cover the box', () => {
    expect(declarations(css, '.recipe-thumb img')).toMatchObject({ 'inline-size': '100%', 'block-size': '100%', 'object-fit': 'cover', display: 'block' })
  })
  it('thumb radii: 12 px at 40 and 48, 16 px at 72; the hero is 16:9', () => {
    expect(declarations(css, ".recipe-thumb[data-size='48']")['border-radius']).toBe('var(--radius-thumb)')
    expect(declarations(css, ".recipe-thumb[data-size='72']")['border-radius']).toBe('var(--radius-thumb-lg)')
    expect(declarations(css, ".recipe-thumb[data-size='hero']")['aspect-ratio']).toBe('16 / 9')
  })
  it('the generated tile is soft with accent-text content', () => {
    expect(declarations(css, '.recipe-thumb[data-generated]')).toMatchObject({ background: 'var(--color-soft)', color: 'var(--color-accent-text)' })
  })
})
