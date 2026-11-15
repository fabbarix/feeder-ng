// B9-38 (PC-16 item 8): Recipe monograms in Swap and Choose a Recipe are neutral (surface-2 with a muted letter), not accent-soft.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecipeThumb } from './RecipeThumb'
import { readUiCss } from './test-utils'

describe('RecipeThumb tone="neutral"', () => {
  it('marks the generated tile data-tone="neutral" and shows the initial alone, with no Tag icon', () => {
    const { container } = render(<RecipeThumb name="Risotto ai funghi" tags={['rice']} tone="neutral" />)
    const t = container.querySelector('.recipe-thumb')!
    expect(t).toHaveAttribute('data-tone', 'neutral')
    expect(t).toHaveTextContent('R')
    expect(t.querySelector('.recipe-thumb__icon')).toBeNull()
  })

  it('the default keeps the accent tile and its Tag icon (the Recipe lists elsewhere are unchanged)', () => {
    const { container } = render(<RecipeThumb name="Risotto" tags={['rice']} />)
    const t = container.querySelector('.recipe-thumb')!
    expect(t).not.toHaveAttribute('data-tone')
    expect(t.querySelector('.recipe-thumb__icon')).not.toBeNull()
  })

  it('a photo wins over the tone', () => {
    const { container } = render(<RecipeThumb name="Risotto" photoUrl="/p.jpg" tone="neutral" />)
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.querySelector('.recipe-thumb')).not.toHaveAttribute('data-generated')
  })

  it('the neutral tile is surface-2 with the muted letter (tokens only)', () => {
    const css = readUiCss('RecipeThumb.css')
    const block = /\.recipe-thumb\[data-tone=['"]neutral['"]\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(block).toMatch(/background:\s*var\(--color-surface-2\)/)
    expect(block).toMatch(/color:\s*var\(--color-muted\)/)
  })
})
